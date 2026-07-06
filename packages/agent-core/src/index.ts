import type { ChatMessage, ChatProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import { z } from 'zod';

import { builtinTools } from '#tools/builtin';
import { ToolRegistry } from '#tools/types';

export * from '#tools/types';
export * from '#tools/builtin';

/** Thrown by run() when its AbortSignal fires. Callers catch it by name. */
export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

const COMPACTION_PROMPT =
  'You summarize a coding-agent conversation so it can continue in fewer tokens. ' +
  'Write a compact but complete summary: the original task, key decisions, files ' +
  'read or changed (with their paths), tool results that still matter, and what ' +
  'remains to be done.';

export const AgentConfigSchema = z.object({
  name: z.string(),
  systemPrompt: z
    .string()
    .default(
      'You are a coding agent running in a terminal. You can read and write files, ' +
      'list directories, and run shell commands via tools. Work step by step: ' +
      'inspect before you edit, verify after you change. Keep answers concise.',
    ),
  maxTurns: z.number().int().positive().default(24),
  compaction: z
    .object({
      enabled: z.boolean().default(true),
      /** Rough transcript size (chars of JSON) that triggers compaction. */
      maxChars: z.number().int().positive().default(120_000),
      /** How many recent messages survive compaction verbatim. */
      keepRecent: z.number().int().positive().default(8),
    })
    .default({ enabled: true, maxChars: 120_000, keepRecent: 8 }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface AgentEvents {
  /** The complete assistant text for the turn (streamed or not). */
  onText?(text: string): void;
  onToolCall?(name: string, args: string): void;
  onToolResult?(name: string, result: string): void;
  /** A streamed fragment of assistant text, in order. Fires before onText. */
  onTextDelta?(textDelta: string): void;
  /**
   * Asked before every tool execution. Return false to block the tool;
   * the model receives a denial message as the tool result and can adapt.
   * Omit the callback to allow everything (Part 2 behavior).
   */
  canUseTool?(name: string, args: string): Promise<boolean> | boolean;
  /** Fired after old messages were folded into a summary. */
  onCompaction?(messagesBefore: number, messagesAfter: number): void;
}

export class Agent {
  private readonly messages: ChatMessage[] = [];
  readonly tools = new ToolRegistry();

  constructor(
    private readonly provider: ChatProvider,
    private readonly config: AgentConfig,
    private readonly events: AgentEvents = {},
  ) {
    this.messages.push({ role: 'system', content: config.systemPrompt });
    for (const tool of builtinTools) {
      this.tools.register(tool);
    }
  }

  /** Read-only view of the transcript — for UIs, tests, and metrics. */
  get history(): readonly ChatMessage[] {
    return this.messages;
  }

  /** Rough size estimate; JSON covers text, tool args and results alike. */
  private transcriptSize(): number {
    return JSON.stringify(this.messages).length;
  }

  private async maybeCompact(): Promise<void> {
    const { enabled, maxChars, keepRecent } = this.config.compaction;
    if (!enabled || this.transcriptSize() <= maxChars) return;

    // messages[0] is the system prompt — it never compacts. Keep the last
    // `keepRecent` messages, but a tool result must never open the kept
    // tail (its assistant tool-call message would be gone, and the API
    // rejects orphaned tool results): walk the cut point back until the
    // tail starts on a non-tool message.
    let cut = Math.max(1, this.messages.length - keepRecent);
    while (cut > 1 && this.messages[cut]?.role === 'tool') cut -= 1;
    const old = this.messages.slice(1, cut);
    if (old.length === 0) return;

    // Plain chat(), no tools, no streaming: the summary is bookkeeping,
    // not something the user should watch scroll by.
    const response = await this.provider.chat({
      messages: [
        { role: 'system', content: COMPACTION_PROMPT },
        {
          role: 'user',
          content: `Summarize this transcript:\n\n${JSON.stringify(old, null, 2)}`,
        },
      ],
    });
    const summary = response.content ?? '(no summary produced)';

    const before = this.messages.length;
    const kept = this.messages.slice(cut);
    this.messages.length = 1;
    this.messages.push({
      role: 'user',
      content:
        `[Context was compacted. Summary of the ${old.length} earlier messages:]\n` +
        summary,
    });
    this.messages.push(...kept);
    this.events.onCompaction?.(before, this.messages.length);
  }

  /** Run one user prompt to completion (possibly many LLM round-trips). */
  async run(prompt: string, signal?: AbortSignal): Promise<string> {   // ← new: signal
    this.messages.push({ role: 'user', content: prompt });

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
/*      const response = await this.provider.chat({
        messages: this.messages,
        tools: this.tools.specs(),
      });*/

      await this.maybeCompact(); // 在循环中触发
      if (signal?.aborted) throw new AbortError();                     // ← new: cancel between turns

      const request = {
        messages: this.messages,
        tools: this.tools.specs(),
      };

      const response =
        this.provider.stream !== undefined
          ? await this.provider.stream(request, (textDelta) => {
            this.events.onTextDelta?.(textDelta);
          })
          : await this.provider.chat(request);

      this.messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
      });

      if (response.content !== null && response.content !== '') {
        this.events.onText?.(response.content);
      }

      if (response.toolCalls.length === 0) {
        return response.content ?? '';
      }

     /* for (const call of response.toolCalls) {
        this.events.onToolCall?.(call.name, call.arguments);
        const result = await this.tools.dispatch(call.name, call.arguments);
        this.events.onToolResult?.(call.name, result);
        this.messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result,
        });
      }*/
      for (const call of response.toolCalls) {
        if (signal?.aborted) throw new AbortError();                   // ← new: cancel before a tool
        this.events.onToolCall?.(call.name, call.arguments);
        const approved =
          (await this.events.canUseTool?.(call.name, call.arguments)) ?? true;
        const result = approved
          ? await this.tools.dispatch(call.name, call.arguments)
          : `Error: the user denied permission to run ${call.name}. ` +
          'Do not retry the same call; ask the user or try a different approach.';
        this.events.onToolResult?.(call.name, result);
        this.messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result,
        });
      }
    }

    return '[coding-agent stopped: reached max turns]';
  }
}

import type { ChatMessage, ChatProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import { z } from 'zod';

import { builtinTools } from '#tools/builtin';
import { ToolRegistry } from '#tools/types';

export * from '#tools/types';
export * from '#tools/builtin';

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
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface AgentEvents {
  onText?(text: string): void;
  onToolCall?(name: string, args: string): void;
  onToolResult?(name: string, result: string): void;
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

  /** Run one user prompt to completion (possibly many LLM round-trips). */
  async run(prompt: string): Promise<string> {
    this.messages.push({ role: 'user', content: prompt });

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      const response = await this.provider.chat({
        messages: this.messages,
        tools: this.tools.specs(),
      });

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

      for (const call of response.toolCalls) {
        this.events.onToolCall?.(call.name, call.arguments);
        const result = await this.tools.dispatch(call.name, call.arguments);
        this.events.onToolResult?.(call.name, result);
        this.messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result,
        });
      }
    }

    return '[agent stopped: reached max turns]';
  }
}

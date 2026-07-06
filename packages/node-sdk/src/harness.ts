import { Agent, AgentConfigSchema } from '@kevin.xie.toronto/agent-core';
import type { AgentEvents, ToolDefinition } from '@kevin.xie.toronto/agent-core';
import { createOpenAICompatibleProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import type { ChatProvider } from '@kevin.xie.toronto/llm-provider-abstraction';

import { createSkillTool, renderSkillsCatalog } from '#skills/index';
import type { Skill } from '#skills/index';

export interface AgentHarnessOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Directory for request/response JSON logs; omit to disable. */
  logDir?: string;
  systemPrompt?: string;
  maxTurns?: number;
  /** Skills to advertise (catalog → system prompt) and expose via use_skill. */
  skills?: Skill[];
  /**
   * Escape hatch for tests and embedders: bring your own provider.
   * When set, apiKey/baseUrl/model/logDir are ignored.
   */
  provider?: ChatProvider;
}

export interface AgentHarness {
  /** Run one task to completion; resolves with the final assistant text. */
  runTask(prompt: string, signal?: AbortSignal): Promise<string>;   // ← new: signal
  /** Add a custom tool alongside the builtins. */
  registerTool(tool: ToolDefinition): void;
}

export function createAgentHarness(
  options: AgentHarnessOptions,
  events: AgentEvents = {},
): AgentHarness {
  const provider =
    options.provider ??
    createOpenAICompatibleProvider({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? 'https://api.openai.com/v1',
      model: options.model ?? 'gpt-4o-mini',
      ...(options.logDir !== undefined && { logDir: options.logDir }),
    });

  // Parse once so the schema's DEFAULT system prompt is applied before we
  // append the catalog — appending to `options.systemPrompt` (often undefined)
  // would otherwise drop the default entirely.
  const base = AgentConfigSchema.parse({
    name: 'coding-agent',
    ...(options.systemPrompt !== undefined && { systemPrompt: options.systemPrompt }),
    ...(options.maxTurns !== undefined && { maxTurns: options.maxTurns }),
  });

  const skills = options.skills ?? [];
  const catalog = renderSkillsCatalog(skills);
  const config =
    catalog === ''
      ? base
      : { ...base, systemPrompt: `${base.systemPrompt}\n\n${catalog}` };

  const agent = new Agent(provider, config, events);
  if (skills.length > 0) {
    agent.tools.register(createSkillTool(skills));
  }

  return {
    runTask: (prompt, signal) => agent.run(prompt, signal),          // ← new: forward signal
    registerTool: (tool) => agent.tools.register(tool),
  };
}

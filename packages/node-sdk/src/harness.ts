import { Agent, AgentConfigSchema } from '@kevin.xie.toronto/agent-core';
import type { AgentEvents, ToolDefinition } from '@kevin.xie.toronto/agent-core';
import { createOpenAICompatibleProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import type { ChatProvider } from '@kevin.xie.toronto/llm-provider-abstraction';

export interface AgentHarnessOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Directory for request/response JSON logs; omit to disable. */
  logDir?: string;
  systemPrompt?: string;
  maxTurns?: number;
  /**
   * Escape hatch for tests and embedders: bring your own provider.
   * When set, apiKey/baseUrl/model/logDir are ignored.
   */
  provider?: ChatProvider;
}

export interface AgentHarness {
  /** Run one task to completion; resolves with the final assistant text. */
  runTask(prompt: string): Promise<string>;
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

  const config = AgentConfigSchema.parse({
    name: 'coding-agent',
    ...(options.systemPrompt !== undefined && { systemPrompt: options.systemPrompt }),
    ...(options.maxTurns !== undefined && { maxTurns: options.maxTurns }),
  });

  const agent = new Agent(provider, config, events);

  return {
    runTask: (prompt) => agent.run(prompt),
    registerTool: (tool) => agent.tools.register(tool),
  };
}

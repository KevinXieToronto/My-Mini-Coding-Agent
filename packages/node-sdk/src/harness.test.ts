import type { ChatProvider, TokenUsage } from '@kevin.xie.toronto/llm-provider-abstraction';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadHarnessOptionsFromEnv } from './env';
import { createAgentHarness } from './harness';

describe('loadHarnessOptionsFromEnv', () => {
  it('fails without AGENT_API_KEY', () => {
    const result = loadHarnessOptionsFromEnv({});
    expect(result.ok).toBe(false);
  });

  it('applies defaults and honors AGENT_LOG_DIR="" as off', () => {
    const result = loadHarnessOptionsFromEnv({
      AGENT_API_KEY: 'sk-test',
      AGENT_LOG_DIR: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.model).toBe('gpt-4o-mini');
      expect(result.options.baseUrl).toBe('https://api.openai.com/v1');
      expect('logDir' in result.options).toBe(false);
    }
  });
});

describe('createAgentHarness', () => {
  it('runs a task end to end with an injected provider', async () => {
    const provider: ChatProvider = {
      chat: async () => ({ content: 'done', toolCalls: [], finishReason: 'stop' }),
    };
    const harness = createAgentHarness({ apiKey: 'unused', provider });
    expect(await harness.runTask('hello')).toBe('done');
  });

  it('registers custom tools that dispatch like builtins', async () => {
    let calls = 0;
    const provider: ChatProvider = {
      chat: async () => {
        calls += 1;
        return calls === 1
          ? {
            content: null,
            toolCalls: [{ id: 'call_1', name: 'ping', arguments: '{}' }],
            finishReason: 'tool_calls',
          }
          : { content: 'pong received', toolCalls: [], finishReason: 'stop' };
      },
    };
    const harness = createAgentHarness({ apiKey: 'unused', provider });
    harness.registerTool({
      name: 'ping',
      description: 'test tool',
      schema: z.object({}),
      execute: async () => 'pong',
    });
    expect(await harness.runTask('ping please')).toBe('pong received');
  });

  it('folds project memory into the system prompt', () => {
    const provider: ChatProvider = {
      chat: async () => ({ content: 'ok', toolCalls: [], finishReason: 'stop' }),
    };
    const harness = createAgentHarness({ apiKey: 'unused', provider, memory: 'REMEMBER-THIS-RULE' });
    const system = harness.history[0];
    expect(system?.role).toBe('system');
    expect(system?.content).toContain('# Project information');
    expect(system?.content).toContain('REMEMBER-THIS-RULE');
  });

  it('appendContext adds a user message without running a turn', () => {
    const provider: ChatProvider = {
      chat: async () => ({ content: 'ok', toolCalls: [], finishReason: 'stop' }),
    };
    const harness = createAgentHarness({ apiKey: 'unused', provider });
    harness.appendContext('<bash-input>\nls\n</bash-input>');
    const roles = harness.history.map((message) => message.role);
    expect(roles).toEqual(['system', 'user']); // system preserved, one appended
    expect(harness.history[1]?.content).toContain('ls');
  });

  it('forwards provider usage through onUsage', async () => {
    const provider: ChatProvider = {
      chat: async () => ({
        content: 'ok',
        toolCalls: [],
        finishReason: 'stop',
        usage: { inputTokens: 3, outputTokens: 4 },
      }),
    };
    let seen: TokenUsage | undefined;
    const harness = createAgentHarness({ apiKey: 'unused', provider }, { onUsage: (u) => (seen = u) });
    await harness.runTask('hi');
    expect(seen).toEqual({ inputTokens: 3, outputTokens: 4 });
  });

  it('setModel changes the model in force', () => {
    const provider: ChatProvider = {
      chat: async () => ({ content: 'ok', toolCalls: [], finishReason: 'stop' }),
    };
    const harness = createAgentHarness({ apiKey: 'unused', provider, model: 'gpt-4o-mini' });
    expect(harness.model).toBe('gpt-4o-mini');
    harness.setModel('gpt-4o');
    expect(harness.model).toBe('gpt-4o');
  });
});

import type { ChatProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
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
});

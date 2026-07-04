import type { ChatProvider, ChatResponse } from '@kevin.xie.toronto/llm-provider-abstraction';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Agent, AgentConfigSchema, ToolRegistry } from './index';

/** A provider that replays a scripted sequence of responses. */
function scriptedProvider(responses: ChatResponse[]): ChatProvider {
  let index = 0;
  return {
    chat: async () => {
      const response = responses[index];
      index += 1;
      if (response === undefined) throw new Error('script exhausted');
      return response;
    },
  };
}

describe('ToolRegistry', () => {
  it('validates arguments and returns errors as strings', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'echo back',
      schema: z.object({ text: z.string() }),
      execute: async ({ text }) => text,
    });

    expect(await registry.dispatch('echo', '{"text":"hi"}')).toBe('hi');
    expect(await registry.dispatch('echo', '{"wrong":1}')).toContain('Error');
    expect(await registry.dispatch('nope', '{}')).toContain('unknown tool');
  });
});

describe('Agent', () => {
  const config = AgentConfigSchema.parse({ name: 'test' });

  it('returns text when the model does not call tools', async () => {
    const provider = scriptedProvider([
      { content: 'hello!', toolCalls: [], finishReason: 'stop' },
    ]);
    const agent = new Agent(provider, config);
    expect(await agent.run('hi')).toBe('hello!');
  });

  it('executes tool calls and loops until the model answers', async () => {
    const provider = scriptedProvider([
      {
        content: null,
        toolCalls: [{ id: 'call_1', name: 'my_tool', arguments: '{"x":1}' }],
        finishReason: 'tool_calls',
      },
      { content: 'tool said 1', toolCalls: [], finishReason: 'stop' },
    ]);
    const agent = new Agent(provider, config);
    agent.tools.register({
      name: 'my_tool',
      description: 'test tool',
      schema: z.object({ x: z.number() }),
      execute: async ({ x }) => `got ${x}`,
    });

    const seen: string[] = [];
    const agentWithEvents = new Agent(
      scriptedProvider([
        {
          content: null,
          toolCalls: [{ id: 'call_1', name: 'my_tool', arguments: '{"x":1}' }],
          finishReason: 'tool_calls',
        },
        { content: 'tool said 1', toolCalls: [], finishReason: 'stop' },
      ]),
      config,
      { onToolResult: (_name, result) => seen.push(result) },
    );
    agentWithEvents.tools.register({
      name: 'my_tool',
      description: 'test tool',
      schema: z.object({ x: z.number() }),
      execute: async ({ x }) => `got ${x}`,
    });

    expect(await agentWithEvents.run('use the tool')).toBe('tool said 1');
    expect(seen).toEqual(['got 1']);
    void agent; // first agent kept to show construction is cheap
  });

  it('stops at maxTurns instead of looping forever', async () => {
    const loopForever: ChatResponse = {
      content: null,
      toolCalls: [{ id: 'c', name: 'bash', arguments: '{"command":"true"}' }],
      finishReason: 'tool_calls',
    };
    const provider = scriptedProvider(Array.from({ length: 50 }, () => loopForever));
    const shortConfig = AgentConfigSchema.parse({ name: 'test', maxTurns: 3 });
    const agent = new Agent(provider, shortConfig);
    expect(await agent.run('loop')).toContain('max turns');
  });
});

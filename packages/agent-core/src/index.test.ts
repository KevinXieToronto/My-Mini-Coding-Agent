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

describe('Agent streaming & permissions', () => {
  const config = AgentConfigSchema.parse({ name: 'test' });

  it('prefers stream() when the provider offers it and forwards deltas', async () => {
    const deltas: string[] = [];
    const provider: ChatProvider = {
      chat: async () => {
        throw new Error('chat() must not be called when stream() exists');
      },
      stream: async (_request, onDelta) => {
        onDelta('hel');
        onDelta('lo');
        return { content: 'hello', toolCalls: [], finishReason: 'stop' };
      },
    };
    const agent = new Agent(provider, config, {
      onTextDelta: (delta) => deltas.push(delta),
    });

    expect(await agent.run('hi')).toBe('hello');
    expect(deltas).toEqual(['hel', 'lo']);
  });

  it('blocks a tool when canUseTool returns false and tells the model', async () => {
    let executed = false;
    const toolResults: string[] = [];
    const provider = scriptedProvider([
      {
        content: null,
        toolCalls: [{ id: 'call_1', name: 'danger', arguments: '{}' }],
        finishReason: 'tool_calls',
      },
      { content: 'understood, I will ask first', toolCalls: [], finishReason: 'stop' },
    ]);
    const agent = new Agent(provider, config, {
      canUseTool: () => false,
      onToolResult: (_name, result) => toolResults.push(result),
    });
    agent.tools.register({
      name: 'danger',
      description: 'should never run',
      schema: z.object({}),
      execute: async () => {
        executed = true;
        return 'ran';
      },
    });

    expect(await agent.run('do the dangerous thing')).toBe(
      'understood, I will ask first',
    );
    expect(executed).toBe(false);
    expect(toolResults[0]).toContain('denied permission');
  });

  it('allows every tool when canUseTool is not provided', async () => {
    const provider = scriptedProvider([
      {
        content: null,
        toolCalls: [{ id: 'call_1', name: 'safe', arguments: '{}' }],
        finishReason: 'tool_calls',
      },
      { content: 'done', toolCalls: [], finishReason: 'stop' },
    ]);
    const agent = new Agent(provider, config);
    let executed = false;
    agent.tools.register({
      name: 'safe',
      description: 'runs freely',
      schema: z.object({}),
      execute: async () => {
        executed = true;
        return 'ok';
      },
    });

    await agent.run('go');
    expect(executed).toBe(true);
  });
});

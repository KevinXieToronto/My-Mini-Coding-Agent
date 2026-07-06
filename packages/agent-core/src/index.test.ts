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

describe('Agent context compaction', () => {
  it('folds old messages into a summary once the transcript exceeds maxChars', async () => {
    const config = AgentConfigSchema.parse({
      name: 'test',
      compaction: { enabled: true, maxChars: 500, keepRecent: 1 },
    });
    const provider = scriptedProvider([
      // run 1: a long answer that pushes the transcript over the threshold
      { content: `first answer: ${'x'.repeat(600)}`, toolCalls: [], finishReason: 'stop' },
      // run 2: the compaction summary call, then the real turn
      { content: 'THE SUMMARY', toolCalls: [], finishReason: 'stop' },
      { content: 'second answer', toolCalls: [], finishReason: 'stop' },
    ]);
    const compactions: Array<[number, number]> = [];
    const agent = new Agent(provider, config, {
      onCompaction: (before, after) => compactions.push([before, after]),
    });

    await agent.run('question one');
    expect(await agent.run('question two')).toBe('second answer');

    expect(compactions).toEqual([[4, 3]]);
    const summary = agent.history.find(
      (message) => message.role === 'user' && message.content.includes('THE SUMMARY'),
    );
    expect(summary).toBeDefined();
    expect(
      agent.history.some((message) => message.content?.includes('first answer')),
    ).toBe(false);
  });

  it('never lets the kept tail start on a tool result', async () => {
    const config = AgentConfigSchema.parse({
      name: 'test',
      compaction: { enabled: true, maxChars: 400, keepRecent: 3 },
    });
    const provider = scriptedProvider([
      // run 1: one tool call with a large result, then an answer
      {
        content: null,
        toolCalls: [{ id: 'call_1', name: 'big', arguments: '{}' }],
        finishReason: 'tool_calls',
      },
      { content: 'first done', toolCalls: [], finishReason: 'stop' },
      // run 2: the compaction summary call, then the real answer
      { content: 'SUMMARY', toolCalls: [], finishReason: 'stop' },
      { content: 'second done', toolCalls: [], finishReason: 'stop' },
    ]);
    const agent = new Agent(provider, config);
    agent.tools.register({
      name: 'big',
      description: 'returns a big payload',
      schema: z.object({}),
      execute: async () => 'y'.repeat(600),
    });

    await agent.run('use the big tool');
    await agent.run('follow-up');

    // Compaction did happen...
    expect(agent.history[1]?.content).toContain('SUMMARY');
    // ...and every tool message still follows an assistant message —
    // otherwise the next API request would be rejected as malformed.
    agent.history.forEach((message, index) => {
      if (message.role !== 'tool') return;
      expect(agent.history[index - 1]?.role).toBe('assistant');
    });
  });
});

it('advertises raw parameters verbatim when provided, ignoring the zod schema', () => {
  const registry = new ToolRegistry();
  const rawParameters = {
    type: 'object',
    properties: { path: { type: 'string', description: 'file to read' } },
    required: ['path'],
  };
  registry.register({
    name: 'external_tool',
    description: 'comes from an MCP server',
    schema: z.record(z.string(), z.unknown()),
    parameters: rawParameters,
    execute: async () => 'ok',
  });

  const spec = registry.specs().find((s) => s.name === 'external_tool');
  // The model sees the server's schema, not `{}` derived from z.record.
  expect(spec?.parameters).toEqual(rawParameters);
});

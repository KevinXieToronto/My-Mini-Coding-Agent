import type { ChatProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import { describe, expect, it } from 'vitest';

import { createAgentHarness } from '../harness';
import { connectMcpServer } from './connect';
import { isHttpConfig, type McpClient, type McpServerConfig } from './types';

/** A scripted MCP server: fixed tool list, records the calls it receives. */
function fakeClient(overrides: Partial<McpClient> = {}): McpClient & { calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    connect: async () => {},
    close: async () => {},
    listTools: async () => [
      {
        name: 'read_file',
        description: 'read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    ],
    callTool: async (name, args) => {
      calls.push([name, args]);
      return { content: [{ type: 'text', text: `contents of ${(args as { path: string }).path}` }] };
    },
    ...overrides,
  };
}

describe('connectMcpServer', () => {
  it('qualifies tool names and advertises the server schema verbatim', async () => {
    const client = fakeClient();
    const connection = await connectMcpServer('filesystem', { command: 'x' }, () => client);

    expect(connection.tools).toHaveLength(1);
    const tool = connection.tools[0]!;
    expect(tool.name).toBe('mcp__filesystem__read_file');
    expect(tool.parameters).toEqual({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    });
  });

  it('calls the server with the ORIGINAL (unqualified) name and flattens text', async () => {
    const client = fakeClient();
    const connection = await connectMcpServer('filesystem', { command: 'x' }, () => client);

    const result = await connection.tools[0]!.execute({ path: 'a.txt' });

    expect(result).toBe('contents of a.txt');
    expect(client.calls).toEqual([['read_file', { path: 'a.txt' }]]);
  });

  it('prefixes error results so the model can see and recover', async () => {
    const client = fakeClient({
      callTool: async () => ({ content: [{ type: 'text', text: 'no such file' }], isError: true }),
    });
    const connection = await connectMcpServer('filesystem', { command: 'x' }, () => client);

    expect(await connection.tools[0]!.execute({ path: 'x' })).toContain('MCP tool error:');
  });
});

describe('MCP tools dispatch through the harness like builtins', () => {
  it('runs an end-to-end task where the model calls an MCP tool', async () => {
    const client = fakeClient();
    const connection = await connectMcpServer('filesystem', { command: 'x' }, () => client);

    // The provider calls the MCP tool on turn 1, answers on turn 2.
    let calls = 0;
    const provider: ChatProvider = {
      chat: async () => {
        calls += 1;
        return calls === 1
          ? {
              content: null,
              toolCalls: [{ id: 'c1', name: 'mcp__filesystem__read_file', arguments: '{"path":"a.txt"}' }],
              finishReason: 'tool_calls',
            }
          : { content: 'the file says hi', toolCalls: [], finishReason: 'stop' };
      },
    };
    const harness = createAgentHarness({ apiKey: 'unused', provider });
    for (const tool of connection.tools) harness.registerTool(tool);

    expect(await harness.runTask('read a.txt')).toBe('the file says hi');
    expect(client.calls).toEqual([['read_file', { path: 'a.txt' }]]);
  });
});

describe('config discrimination', () => {
  it('identifies HTTP configs by the presence of a url', () => {
    const http: McpServerConfig = { url: 'https://example.com/mcp' };
    const stdio: McpServerConfig = { command: 'npx', args: ['server'] };
    expect(isHttpConfig(http)).toBe(true);
    expect(isHttpConfig(stdio)).toBe(false);
  });
});

describe('connectMcpServer transport selection', () => {
  it('passes the exact config through to the injected factory', async () => {
    const httpConfig: McpServerConfig = {
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer t' },
    };
    let seen: McpServerConfig | undefined;
    await connectMcpServer('remote', httpConfig, (config) => {
      seen = config;
      return fakeClient();
    });
    // The wrapper doesn't inspect or mutate config — the factory owns the
    // stdio-vs-http choice, and it receives the entry verbatim.
    expect(seen).toBe(httpConfig);
  });

  it('wraps an HTTP server the same way it wraps a stdio one', async () => {
    const client = fakeClient();
    const connection = await connectMcpServer(
      'remote',
      { url: 'https://example.com/mcp' },
      () => client,
    );

    // Same qualified name, same verbatim schema, same original-name callback —
    // proof that nothing downstream of connect() cares about the transport.
    expect(connection.tools[0]!.name).toBe('mcp__remote__read_file');
    expect(await connection.tools[0]!.execute({ path: 'a.txt' })).toBe(
      'contents of a.txt',
    );
    expect(client.calls).toEqual([['read_file', { path: 'a.txt' }]]);
  });
});

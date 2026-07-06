import type { ToolDefinition } from '@kevin.xie.toronto/agent-core';
import { z } from 'zod';

import { StdioMcpClient } from './stdio-client';
import { qualifyMcpToolName } from './tool-naming';
import type { McpClient, McpStdioConfig, McpToolResult } from './types';

export interface McpConnection {
  /** Tools ready to hand to `harness.registerTool`. */
  tools: ToolDefinition[];
  /** Terminate the server. Call on shutdown. */
  close(): Promise<void>;
}

/**
 * Connect to one stdio MCP server, list its tools, and wrap each as a
 * ToolDefinition. `clientFactory` is the test seam: inject a fake MCPClient
 * and no child process is spawned.
 */
export async function connectMcpServer(
  serverName: string,
  config: McpStdioConfig,
  clientFactory: (config: McpStdioConfig) => McpClient = (c) => new StdioMcpClient(c),
): Promise<McpConnection> {
  const client = clientFactory(config);
  await client.connect();
  const defs = await client.listTools();

  const tools = defs.map<ToolDefinition>((def) => ({
    name: qualifyMcpToolName(serverName, def.name),
    description: def.description ?? `${def.name} (via ${serverName})`,
    // Server owns validation; we accept any object and forward it.
    schema: z.record(z.string(), z.unknown()),
    parameters: assertJsonSchema(serverName, def.name, def.inputSchema),
    // The closure captures the ORIGINAL name — the server has never heard of
    // the `mcp__…` prefix, that's purely for the model's namespace.
    execute: async (args) =>
      flattenResult(await client.callTool(def.name, args as Record<string, unknown>)),
  }));

  return { tools, close: () => client.close() };
}

/** MCP advertises JSON Schema as an object; reject anything else early. */
function assertJsonSchema(
  server: string,
  tool: string,
  inputSchema: unknown,
): Record<string, unknown> {
  if (
    typeof inputSchema === 'object' &&
    inputSchema !== null &&
    !Array.isArray(inputSchema)
  ) {
    return inputSchema as Record<string, unknown>;
  }
  throw new Error(
    `MCP tool ${server}/${tool}: inputSchema must be a JSON object, got ${typeof inputSchema}`,
  );
}

/** Collapse the content-block array into the single string the engine expects. */
function flattenResult(result: McpToolResult): string {
  const text = result.content
    .map((block) => (block.type === 'text' ? (block.text ?? '') : `[${block.type} content]`))
    .join('\n');
  return result.isError ? `MCP tool error:\n${text}` : text;
}

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type {
  McpClient,
  McpStdioConfig,
  McpToolDefinition,
  McpToolResult,
} from './types';

/**
 * Spawns an MCP server as a child process and talks to it over stdin/stdout.
 * `connect()` performs the handshake; `close()` terminates the child.
 */
export class StdioMcpClient implements McpClient {
  private readonly client: Client;
  private readonly transport: StdioClientTransport;

  constructor(config: McpStdioConfig) {
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      // Inherit the parent env so PATH/HOME survive — otherwise npx/uvx-style
      // servers can't launch even with a valid config. config.env overrides.
      env: { ...filterUndefined(process.env), ...(config.env ?? {}) },
      cwd: config.cwd,
    });
    this.client = new Client({ name: 'coding-agent', version: '1.0.0' });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const result = await this.client.callTool({ name, arguments: args });
    return result as McpToolResult;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function filterUndefined(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

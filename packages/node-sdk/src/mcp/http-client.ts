import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type {
  McpClient,
  McpHttpConfig,
  McpToolDefinition,
  McpToolResult,
} from './types';

/**
 * Connects to an already-running MCP server over HTTP. Tries the modern
 * Streamable HTTP transport first; on a handshake failure, falls back to the
 * legacy SSE transport, which many older remote servers still speak.
 *
 * Note there is no child process: `close()` tears down the HTTP session, it
 * does not kill anything. The server's lifecycle is not ours to manage.
 */
export class HttpMcpClient implements McpClient {
  private readonly client: Client;
  private readonly config: McpHttpConfig;

  constructor(config: McpHttpConfig) {
    this.config = config;
    this.client = new Client({ name: 'coding-agent', version: '1.0.0' });
  }

  async connect(): Promise<void> {
    const url = new URL(this.config.url);
    // Headers ride on every request the transport makes — this is where an
    // Authorization bearer token or an API key gets attached.
    const requestInit = this.config.headers
      ? { headers: this.config.headers }
      : undefined;

    try {
      await this.client.connect(
        new StreamableHTTPClientTransport(url, { requestInit }),
      );
    } catch {
      // Older servers only speak SSE. A fresh transport is required — the
      // failed one is not reusable after a rejected handshake.
      await this.client.connect(new SSEClientTransport(url, { requestInit }));
    }
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

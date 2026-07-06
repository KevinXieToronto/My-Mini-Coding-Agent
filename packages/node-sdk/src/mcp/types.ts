/** A tool as advertised by an MCP server's `tools/list`. */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: unknown; // JSON Schema; validated before use
}

/** One content block from a `tools/call` result. */
export interface McpContentBlock {
  type: string; // 'text' | 'image' | 'resource' | ...
  text?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
}

/**
 * The minimal MCP surface the wrapper consumes. Real transports (stdio, HTTP)
 * implement it; tests inject a fake. Keeping it this small is what keeps the
 * SDK-type graph out of the tests — the same seam the upstream `MCPClient` draws.
 */
export interface McpClient {
  connect(): Promise<void>;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close(): Promise<void>;
}

/** stdio server description — command + args, plus optional env/cwd. */
export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

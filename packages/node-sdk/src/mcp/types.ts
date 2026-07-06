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

/**
 * Remote server description — a URL plus optional headers (Authorization,
 * an API key, a tenant id). No command: the server is already running
 * somewhere and we connect to it over HTTP.
 */
export interface McpHttpConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * One server entry from mcp.json. The presence of `command` vs `url` is the
 * discriminant — that's the single fact the transport factory branches on.
 */
export type McpServerConfig = McpStdioConfig | McpHttpConfig;

/** Narrowing helper: is this a remote (HTTP) server rather than a spawned one? */
export function isHttpConfig(config: McpServerConfig): config is McpHttpConfig {
  return 'url' in config;
}

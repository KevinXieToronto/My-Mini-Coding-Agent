// The hand-picked public surface. Apps import this package and nothing else —
// never agent-core, never the provider package.
export { createAgentHarness } from '#harness';
export type { AgentHarness, AgentHarnessOptions } from '#harness';
export { loadHarnessOptionsFromEnv } from '#env';
export type { EnvResult } from '#env';

// Types apps need to talk to the harness, re-exported so the app's
// package.json never lists the engine packages at all.
export type { AgentEvents, ToolDefinition } from '@kevin.xie.toronto/agent-core';
export type {
  ChatProvider,
  ChatResponse,
} from '@kevin.xie.toronto/llm-provider-abstraction';

// MCP: connect to external tool servers and register their tools.
export { connectMcpServer, loadMcpConfig } from '#mcp/index';
export type {
  McpConnection,
  McpHttpConfig,
  McpJson,
  McpServerConfig,
  McpStdioConfig,
} from '#mcp/index';

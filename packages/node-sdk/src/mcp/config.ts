import { readFileSync } from 'node:fs';

import type { McpServerConfig } from './types';

export interface McpJson {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Read an mcp.json describing stdio and/or HTTP servers. Returns an empty map
 * when the file is absent — running without MCP is the normal case, not an
 * error. Reports, never exits (same discipline as loadHarnessOptionsFromEnv).
 */
export function loadMcpConfig(path = '.agent/mcp.json'): McpJson {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { mcpServers: {} };
  }
  const parsed = JSON.parse(raw) as Partial<McpJson>;
  return { mcpServers: parsed.mcpServers ?? {} };
}

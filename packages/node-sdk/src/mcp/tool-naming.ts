const PREFIX = 'mcp__';
const SEPARATOR = '__';

/**
 * Replace unsafe characters with `_`, then collapse runs of `_`. Collapsing
 * guarantees a sanitized part never contains the `__` separator, so the name
 * can be split unambiguously on the first `__` after the prefix.
 */
export function sanitizeNamePart(part: string): string {
  return part.replaceAll(/[^a-zA-Z0-9_-]/g, '_').replaceAll(/_+/g, '_');
}

/** `mcp__filesystem__read_file` — the name the model sees and calls. */
export function qualifyMcpToolName(serverName: string, toolName: string): string {
  return `${PREFIX}${sanitizeNamePart(serverName)}${SEPARATOR}${sanitizeNamePart(toolName)}`;
}

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

// Skills: progressive-disclosure playbooks discovered from .agent/skills.
export { discoverSkills, renderSkillsCatalog, createSkillTool } from '#skills/index';
export type { Skill } from '#skills/index';

// Project memory: AGENTS.md files merged into the system prompt at startup.
export { discoverMemory } from '#memory/index';
export type { Memory } from '#memory/index';

// @file mentions: inline a named file's contents into the prompt.
export { expandMentions } from '#mentions/index';
export type { MentionExpansion } from '#mentions/index';

// Slash commands: user-invoked prompt templates discovered from .agent/commands.
export { discoverCommands, substituteArgs, parseCommandLine } from '#commands/index';
export type { SlashCommand } from '#commands/index';

// Sessions: snapshot the conversation to disk, resume it later.
export { saveSession, loadSession, listSessions, latestSession } from '#session/index';
export type { StoredSession } from '#session/index';
export type { ChatMessage } from '@kevin.xie.toronto/llm-provider-abstraction';

// Usage & cost: accumulate token tallies and price them (policy lives here).
export { addUsage, emptyUsage, costOf, formatTokens, MODEL_PRICING } from '#usage/index';
export type { TokenUsage } from '@kevin.xie.toronto/llm-provider-abstraction';

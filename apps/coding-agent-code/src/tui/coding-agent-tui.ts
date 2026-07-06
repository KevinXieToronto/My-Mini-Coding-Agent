import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';

import {
  createAgentHarness,
  loadHarnessOptionsFromEnv,
  connectMcpServer,
  loadMcpConfig,
} from '@kevin.xie.toronto/coding-agent-sdk';
import type { AgentHarness, McpConnection } from '@kevin.xie.toronto/coding-agent-sdk';
import chalk from 'chalk';

/** Read-only tools never need approval. */
const AUTO_APPROVED = new Set(['read_file', 'list_dir']);

function createHarness(readline: Interface): AgentHarness {
  const loaded = loadHarnessOptionsFromEnv();
  if (!loaded.ok) {
    console.error(chalk.red(loaded.error));
    process.exit(1);
  }

  // Tools the user answered "a" (always) for — approved for the session.
  const sessionApproved = new Set<string>();
  // Whether the current assistant message has streamed any text yet.
  let streaming = false;

  return createAgentHarness(loaded.options, {
    onTextDelta: (textDelta) => {
      if (!streaming) {
        process.stdout.write('\n');
        streaming = true;
      }
      process.stdout.write(textDelta);
    },
    onText: (text) => {
      if (streaming) {
        // Deltas already drew the message; just terminate the line.
        process.stdout.write('\n');
        streaming = false;
      } else {
        // Non-streaming provider fallback: draw the whole message now.
        console.log(`\n${text}`);
      }
    },
    onToolCall: (name, args) => {
      const preview = args.length > 120 ? `${args.slice(0, 120)}...` : args;
      console.log(chalk.dim(`  ⏺ ${name}(${preview})`));
    },
    onToolResult: (name, result) => {
      const firstLine = result.split('\n')[0] ?? '';
      console.log(chalk.dim(`    ↳ ${firstLine.slice(0, 100)}`));
    },
    onCompaction: (before, after) => {
      console.log(
        chalk.dim(`  ⧉ compacted context: ${before} → ${after} messages`),
      );
    },
    canUseTool: async (name, args) => {
      if (AUTO_APPROVED.has(name) || sessionApproved.has(name)) return true;
      const preview = args.length > 200 ? `${args.slice(0, 200)}...` : args;
      const answer = (
        await readline.question(
          chalk.yellow(`  allow ${name}(${preview})? [y/N/a=always] `),
        )
      )
        .trim()
        .toLowerCase();
      if (answer === 'a' || answer === 'always') {
        sessionApproved.add(name);
        return true;
      }
      return answer === 'y' || answer === 'yes';
    },
  });
}

export async function startTui(prompt?: string): Promise<void> {
  // The readline interface is created up front and shared: the REPL reads
  // tasks from it, and canUseTool reads approvals from it mid-turn.
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const harness = createHarness(readline);
  const mcpConnections = await registerMcpServers(harness);

  try {
    // One-shot mode: `coding-agent "fix the failing test"`
    if (prompt !== undefined) {
      await harness.runTask(prompt);
      return;
    }

    // Interactive REPL
    console.log(chalk.bold('coding-agent') + chalk.dim(' — type a task, or "exit" to quit'));
    for (;;) {
      const line = (await readline.question(chalk.cyan('\n> '))).trim();
      if (line === '') continue;
      if (line === 'exit' || line === 'quit') break;
      try {
        await harness.runTask(line);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      }
    }
  } finally {
    // Terminate child processes before we exit, or they linger as orphans.
    await Promise.allSettled(mcpConnections.map((connection) => connection.close()));
    readline.close();
  }
}

/**
 * Start every server in mcp.json and register its tools onto the harness.
 * A server that fails to start is logged and skipped — one broken server
 * must not take down the whole session.
 */
async function registerMcpServers(harness: AgentHarness): Promise<McpConnection[]> {
  const { mcpServers } = loadMcpConfig();
  const connections: McpConnection[] = [];
  for (const [name, config] of Object.entries(mcpServers)) {
    try {
      const connection = await connectMcpServer(name, config);
      for (const tool of connection.tools) harness.registerTool(tool);
      connections.push(connection);
      console.log(
        chalk.dim(`  ⧉ mcp: ${name} — ${connection.tools.length} tool(s)`),
      );
    } catch (error) {
      console.error(
        chalk.red(`  ⧉ mcp: ${name} failed to start — ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }
  return connections;
}

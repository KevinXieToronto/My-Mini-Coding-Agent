import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';

import { Agent, AgentConfigSchema } from '@kevin.xie.toronto/agent-core';
import { createOpenAICompatibleProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import chalk from 'chalk';

/** Read-only tools never need approval. */
const AUTO_APPROVED = new Set(['read_file', 'list_dir']);

function createAgentFromEnv(readline: Interface): Agent {
  const apiKey = process.env['AGENT_API_KEY'];
  if (apiKey === undefined || apiKey === '') {
    console.error(chalk.red('AGENT_API_KEY is not set.'));
    console.error('  export AGENT_API_KEY=sk-...            # required');
    console.error('  export AGENT_BASE_URL=https://api.openai.com/v1   # optional');
    console.error('  export AGENT_MODEL=gpt-4o-mini                    # optional');
    console.error('  export AGENT_LOG_DIR=.agent-logs                  # optional, "" to disable');
    process.exit(1);
  }

  // Each API call's request and response are saved as separate JSON files
  // here; set AGENT_LOG_DIR="" to turn logging off.
  const logDir = process.env['AGENT_LOG_DIR'] ?? '.agent-logs';

  const provider = createOpenAICompatibleProvider({
    apiKey,
    baseUrl: process.env['AGENT_BASE_URL'] ?? 'https://api.openai.com/v1',
    model: process.env['AGENT_MODEL'] ?? 'gpt-4o-mini',
    logDir: logDir === '' ? undefined : logDir,
  });

  const config = AgentConfigSchema.parse({ name: 'coding-agent' });

  // Tools the user answered "a" (always) for — approved for the session.
  const sessionApproved = new Set<string>();
  // Whether the current assistant message has streamed any text yet.
  let streaming = false;

  return new Agent(provider, config, {
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
  const agent = createAgentFromEnv(readline);

  try {
    // One-shot mode: `coding-agent "fix the failing test"`
    if (prompt !== undefined) {
      await agent.run(prompt);
      return;
    }

    // Interactive REPL
    console.log(chalk.bold('coding-agent') + chalk.dim(' — type a task, or "exit" to quit'));
    for (;;) {
      const line = (await readline.question(chalk.cyan('\n> '))).trim();
      if (line === '') continue;
      if (line === 'exit' || line === 'quit') break;
      try {
        await agent.run(line);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      }
    }
  } finally {
    readline.close();
  }
}

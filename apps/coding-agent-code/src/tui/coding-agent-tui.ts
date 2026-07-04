import { createInterface } from 'node:readline/promises';

import { Agent, AgentConfigSchema } from '@kevin.xie.toronto/agent-core';
import { createOpenAICompatibleProvider } from '@kevin.xie.toronto/llm-provider-abstraction';
import chalk from 'chalk';

function createAgentFromEnv(): Agent {
  const apiKey = process.env['AGENT_API_KEY'];
  if (apiKey === undefined || apiKey === '') {
    console.error(chalk.red('AGENT_API_KEY is not set.'));
    console.error('  export AGENT_API_KEY=sk-...            # required');
    console.error('  export AGENT_BASE_URL=https://api.openai.com/v1   # optional');
    console.error('  export AGENT_MODEL=gpt-4o-mini                    # optional');
    process.exit(1);
  }

  const provider = createOpenAICompatibleProvider({
    apiKey,
    baseUrl: process.env['AGENT_BASE_URL'] ?? 'https://api.openai.com/v1',
    model: process.env['AGENT_MODEL'] ?? 'gpt-4o-mini',
  });

  const config = AgentConfigSchema.parse({ name: 'coding-agent' });

  return new Agent(provider, config, {
    onText: (text) => {
      console.log(`\n${text}`);
    },
    onToolCall: (name, args) => {
      const preview = args.length > 120 ? `${args.slice(0, 120)}...` : args;
      console.log(chalk.dim(`  ⏺ ${name}(${preview})`));
    },
    onToolResult: (name, result) => {
      const firstLine = result.split('\n')[0] ?? '';
      console.log(chalk.dim(`    ↳ ${firstLine.slice(0, 100)}`));
    },
  });
}

export async function startTui(prompt?: string): Promise<void> {
  const agent = createAgentFromEnv();

  // One-shot mode: `coding-agent "fix the failing test"`
  if (prompt !== undefined) {
    await agent.run(prompt);
    return;
  }

  // Interactive REPL
  console.log(chalk.bold('coding-agent') + chalk.dim(' — type a task, or "exit" to quit'));
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await readline.question(chalk.cyan('\n> '))).trim();
    if (line === '' ) continue;
    if (line === 'exit' || line === 'quit') break;
    try {
      await agent.run(line);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }
  readline.close();
}

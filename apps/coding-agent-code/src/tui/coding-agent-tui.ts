import { AgentConfigSchema, createAgent } from '@kevin.xie.toronto/agent-core';
import chalk from 'chalk';

export async function startTui(prompt?: string): Promise<void> {
  const config = AgentConfigSchema.parse({ name: 'coding-agent'});
  const agent = createAgent(config);
  console.log(chalk.bold(agent.greet()));
  if (prompt !== undefined) {
    console.log(`you said: ${prompt}`);
  }
}

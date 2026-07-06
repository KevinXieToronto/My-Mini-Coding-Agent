import { Command } from 'commander';

import { runShell } from '#cli/run-shell';
import { VERSION } from '#version';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('Coding Agent CLI')
    .description('Coding Agent CLI (scaffolding skeleton)')
    .version(VERSION)
    .argument('[prompt]', 'prompt to send to the agent')
    .action(async (prompt?: string) => {
      await runShell(prompt);
    });
  return program;
}

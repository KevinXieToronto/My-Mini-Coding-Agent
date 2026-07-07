import { Command } from 'commander';

import { runShell } from '#cli/run-shell';
import type { ShellOptions } from '#cli/run-shell';
import { VERSION } from '#version';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('Coding Agent CLI')
    .description('Coding Agent CLI (scaffolding skeleton)')
    .version(VERSION)
    .argument('[prompt]', 'prompt to send to the agent')
    .option('-r, --resume [id]', 'resume a session (newest overall if no id given)')
    .option('-c, --continue', 'continue the most recent session for this directory')
    .option('--list', 'list saved sessions and exit')
    .action(async (prompt: string | undefined, opts: ShellOptions) => {
      await runShell(prompt, opts);
    });
  return program;
}

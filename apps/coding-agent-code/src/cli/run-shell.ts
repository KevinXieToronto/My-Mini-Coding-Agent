import { startTui } from '#tui/coding-agent-tui';

export async function runShell(prompt?: string): Promise<void> {
  await startTui(prompt);
}

import { startTui } from '#tui/kimi-tui';

export async function runShell(prompt?: string): Promise<void> {
  await startTui(prompt);
}

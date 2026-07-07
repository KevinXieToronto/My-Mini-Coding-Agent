import { startTui } from '#tui/coding-agent-tui';

/** Parsed CLI flags that concern sessions. */
export interface ShellOptions {
  /** `-r`: string id, or `true` for a bare `--resume` (newest overall). */
  resume?: string | boolean;
  /** `-c`: continue the newest session for the current directory. */
  continue?: boolean;
  /** `--list`: print saved sessions and exit. */
  list?: boolean;
}

export async function runShell(prompt?: string, opts: ShellOptions = {}): Promise<void> {
  await startTui(prompt, opts);
}

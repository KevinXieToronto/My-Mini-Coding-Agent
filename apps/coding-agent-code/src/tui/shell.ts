import { spawnSync } from 'node:child_process';

import chalk from 'chalk';

/** What a bang command produced. `isError` drives red-vs-dim on screen. */
export interface BangResult {
  stdout: string;
  stderr: string;
  isError: boolean;
}

/** Strip ANSI/OSC escapes so captured output can't corrupt the TUI render. */
export function sanitizeShellOutput(text: string): string {
  // Strip CSI colour/cursor sequences (ESC [ ... final byte); keep \n and \t.
  // Normalize CRLF/lone-CR to \n: a stray \r resets the terminal cursor to
  // column 0, so Windows tools' \r\n line endings would blank each rendered
  // line (`!dir` showed only its footer). wrap() splits on \n, not \r.
  return text.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n');
}

/** XML-escape so a command that prints `<` can't forge a fake tag in context. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The model's copy of the command, tagged as real Kimi Code tags it. */
export function bashInputTag(command: string): string {
  return `<bash-input>\n${escapeXml(command)}\n</bash-input>`;
}

/** The model's copy of the output, stdout and stderr in one tagged message. */
export function bashOutputTag(stdout: string, stderr: string): string {
  return `<bash-stdout>${escapeXml(stdout)}</bash-stdout><bash-stderr>${escapeXml(stderr)}</bash-stderr>`;
}

/** The screen's copy: dim stdout, red stderr only on real failure. */
export function formatBashOutputForDisplay(
  stdout: string,
  stderr: string,
  isError = false,
): string {
  const parts: string[] = [];
  if (stdout.trim() !== '') parts.push(chalk.dim(stdout.trimEnd()));
  if (stderr.trim() !== '') {
    parts.push(isError ? chalk.red(stderr.trimEnd()) : chalk.dim(stderr.trimEnd()));
  }
  return parts.length === 0 ? chalk.dim('(no output)') : parts.join('\n');
}

/**
 * Run a `!` command synchronously and capture its output. Synchronous keeps
 * this part small: a bang command blocks the render for its (bounded) duration.
 * The real Kimi Code streams shell output live through a background task — the
 * 20% you'd add the day a `!npm test` needs to scroll as it runs.
 */
export function runBangCommand(command: string, cwd = process.cwd()): BangResult {
  const result = spawnSync(command, {
    cwd,
    shell: true, // let the OS shell parse pipes, globs, redirection
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  const stdout = sanitizeShellOutput(result.stdout ?? '');
  const stderrRaw = sanitizeShellOutput(result.stderr ?? '');
  const isError = result.error !== undefined || (result.status ?? 0) !== 0;
  const stderr = result.error !== undefined ? `${stderrRaw}${result.error.message}` : stderrRaw;
  return { stdout, stderr, isError };
}

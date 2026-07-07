/**
 * Substitute a command's arguments into its template body.
 * - `$ARGUMENTS` → the full argument string (everything after the command name)
 * - `$1`, `$2`, … → the Nth whitespace-separated argument (1-based)
 *
 * Unknown placeholders are left untouched: a template is prose, not code, and a
 * literal `$5` with no fifth argument should survive rather than silently vanish.
 */
export function substituteArgs(body: string, args: string): string {
  const positional = args.split(/\s+/).filter((arg) => arg !== '');
  return body
    .replace(/\$ARGUMENTS\b/g, args)
    .replace(/\$(\d+)/g, (whole, digits: string) => {
      const value = positional[Number(digits) - 1];
      return value ?? whole; // no such argument → leave the placeholder as-is
    });
}

/**
 * Split a raw input line into a command name and its argument string.
 * `/review src/app.ts now` → { name: 'review', args: 'src/app.ts now' }.
 * The caller has already checked the leading `/`; we strip it here.
 */
export function parseCommandLine(input: string): { name: string; args: string } {
  const match = input.replace(/^\//, '').match(/^(\S+)\s*([\s\S]*)$/);
  if (match === null) {
    return { name: '', args: '' };
  }
  return { name: match[1] ?? '', args: (match[2] ?? '').trim() };
}

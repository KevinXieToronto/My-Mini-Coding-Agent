import { describe, expect, it } from 'vitest';

import { bashInputTag, bashOutputTag, escapeXml, runBangCommand, sanitizeShellOutput } from './shell';

describe('shell helpers', () => {
  it('escapes XML so output cannot forge a tag', () => {
    expect(escapeXml('<b> & </b>')).toBe('&lt;b&gt; &amp; &lt;/b&gt;');
    expect(bashInputTag('echo <hi>')).toBe('<bash-input>\necho &lt;hi&gt;\n</bash-input>');
    expect(bashOutputTag('a<b', '')).toBe('<bash-stdout>a&lt;b</bash-stdout><bash-stderr></bash-stderr>');
  });

  it('strips ANSI escape sequences', () => {
    expect(sanitizeShellOutput('\x1B[31mred\x1B[0m')).toBe('red');
  });

  it('normalizes CRLF and lone CR so Windows output does not blank each line', () => {
    // A trailing \r resets the terminal cursor to column 0, blanking the line.
    expect(sanitizeShellOutput('a\r\nb\r\nc')).toBe('a\nb\nc');
    expect(sanitizeShellOutput('x\ry')).toBe('x\ny');
  });

  it('runs a command and captures stdout', () => {
    // `node -e` is available everywhere the agent runs — no shell builtins needed.
    const { stdout, isError } = runBangCommand('node -e "process.stdout.write(\'hi\')"');
    expect(stdout).toBe('hi');
    expect(isError).toBe(false);
  });

  it('flags a failing command', () => {
    const { isError } = runBangCommand('node -e "process.exit(3)"');
    expect(isError).toBe(true);
  });
});

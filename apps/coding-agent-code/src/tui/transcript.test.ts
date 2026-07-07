import { describe, expect, it } from 'vitest';

import { Transcript, renderFrame, transcriptFromHistory, wrap } from '#tui/transcript';

describe('Transcript', () => {
  it('streams deltas into one assistant block until it ends', () => {
    const transcript = new Transcript();
    transcript.appendAssistant('Hel');
    transcript.appendAssistant('lo');
    expect(transcript.all).toEqual([{ kind: 'assistant', text: 'Hello' }]);

    transcript.endAssistant();
    transcript.appendAssistant('again');
    expect(transcript.all).toHaveLength(2); // a fresh block after endAssistant
  });

  it('completes the last running tool in place', () => {
    const transcript = new Transcript();
    transcript.addTool('bash', 'ls');
    transcript.completeTool('a.txt\nb.txt');
    expect(transcript.all[0]).toEqual({
      kind: 'tool',
      name: 'bash',
      args: 'ls',
      status: 'done',
      result: 'a.txt\nb.txt',
    });
  });
});

describe('wrap', () => {
  it('hard-wraps long lines and preserves explicit newlines', () => {
    expect(wrap('abcdef', 3)).toEqual(['abc', 'def']);
    expect(wrap('a\nb', 10)).toEqual(['a', 'b']);
  });
});

describe('renderFrame', () => {
  // Strip ANSI colour codes so assertions don't depend on chalk's TTY detection.
  // eslint-disable-next-line no-control-regex
  const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

  it('boxes content with rounded borders and vertical edges', () => {
    const out = renderFrame(['hi'], 40).map(plain);
    expect(out[0]?.startsWith('╭')).toBe(true);
    expect(out[0]?.endsWith('╮')).toBe(true);
    expect(out[out.length - 1]?.startsWith('╰')).toBe(true);
    expect(out[out.length - 1]?.endsWith('╯')).toBe(true);
    // The one content row is wrapped in "│ … │" and padded to the box width.
    expect(out[1]).toBe('│ hi │');
    // Top border spans the same width as the content row.
    expect(out[0]?.length).toBe(out[1]?.length);
  });

  it('truncates a line that would overflow the width with an ellipsis', () => {
    const width = 12;
    const out = renderFrame(['a'.repeat(50)], width).map(plain);
    for (const line of out) expect(line.length).toBeLessThanOrEqual(width);
    expect(out[1]).toContain('…');
  });
});

describe('transcriptFromHistory', () => {
  it('renders !shell context messages as $-command notices on resume', () => {
    const blocks = transcriptFromHistory([
      { role: 'system', content: 'sys' },
      { role: 'user', content: '<bash-input>\ngit status\n</bash-input>' },
      { role: 'user', content: '<bash-stdout>clean</bash-stdout><bash-stderr></bash-stderr>' },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: 'notice' });
    // chalk may add colour codes; assert on the substring.
    expect((blocks[0] as { text: string }).text).toContain('$ git status');
    expect((blocks[1] as { text: string }).text).toContain('clean');
  });
});

import { describe, expect, it } from 'vitest';

import { Transcript, wrap } from '#tui/transcript';

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

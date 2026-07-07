import { describe, expect, it } from 'vitest';

import { transcriptFromHistory } from '#tui/transcript';

describe('transcriptFromHistory', () => {
  it('projects a mixed transcript into display blocks, pairing tool call + result', () => {
    const blocks = transcriptFromHistory([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'read the file' },
      {
        role: 'assistant',
        content: 'on it',
        toolCalls: [{ id: 'c1', name: 'read_file', arguments: '{"path":"a.ts"}' }],
      },
      { role: 'tool', toolCallId: 'c1', content: 'file contents' },
    ]);

    expect(blocks).toEqual([
      { kind: 'user', text: 'read the file' },
      { kind: 'assistant', text: 'on it' },
      {
        kind: 'tool',
        name: 'read_file',
        args: '{"path":"a.ts"}',
        status: 'done',
        result: 'file contents',
      },
    ]);
  });
});

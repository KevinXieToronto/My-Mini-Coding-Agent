import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { discoverCommands } from './discover';

describe('discoverCommands', () => {
  it('reads each *.md file and names the command after the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmds-'));
    writeFileSync(
      join(dir, 'review.md'),
      '---\ndescription: Review a file.\n---\nReview $ARGUMENTS.\n',
    );
    const commands = discoverCommands(dir);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.name).toBe('review');
    expect(commands[0]!.description).toBe('Review a file.');
    expect(commands[0]!.body).toBe('Review $ARGUMENTS.');
  });

  it('returns [] when the directory is absent', () => {
    expect(discoverCommands(join(tmpdir(), 'no-such-commands-dir-xyz'))).toEqual([]);
  });
});

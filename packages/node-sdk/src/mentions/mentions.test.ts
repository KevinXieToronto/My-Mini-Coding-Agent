import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { expandMentions } from './expand';

describe('expandMentions', () => {
  it('inlines a named file as a <file> block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'men-'));
    writeFileSync(join(dir, 'a.ts'), 'export const x = 1;');

    const { prompt, files } = expandMentions('explain @a.ts', dir);
    expect(files).toEqual(['a.ts']);
    expect(prompt).toContain('<file path="a.ts">');
    expect(prompt).toContain('export const x = 1;');
  });

  it('leaves an unresolved mention as literal text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'men-'));
    const { prompt, files } = expandMentions('email me at a@b.com', dir);
    expect(files).toEqual([]);
    expect(prompt).toBe('email me at a@b.com');
  });

  it('handles quoted paths with spaces and dedupes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'men-'));
    writeFileSync(join(dir, 'my file.ts'), 'ok');
    const { prompt, files } = expandMentions('see @"my file.ts" and @"my file.ts"', dir);
    expect(files).toEqual(['my file.ts']); // once, not twice
    expect(prompt).toContain('<file path="my file.ts">');
  });
});

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { discoverMemory } from './discover';

describe('discoverMemory', () => {
  it('returns empty when there is no memory file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-'));
    expect(discoverMemory(dir)).toEqual({ text: '', sources: [] });
  });

  it('merges root → leaf so the nearest file lands last', () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-'));
    mkdirSync(join(root, '.git')); // marks the project root
    const leaf = join(root, 'pkg');
    mkdirSync(leaf);
    writeFileSync(join(root, 'AGENTS.md'), 'root rule');
    writeFileSync(join(leaf, 'AGENTS.md'), 'leaf rule');

    const { text, sources } = discoverMemory(leaf);
    expect(sources).toHaveLength(2);
    // root first, leaf (nearest) last
    expect(text.indexOf('root rule')).toBeLessThan(text.indexOf('leaf rule'));
    expect(text).toContain('<!-- From:');
  });

  it('prefers AGENTS.md over CLAUDE.md in the same directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-'));
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, 'AGENTS.md'), 'agents wins');
    writeFileSync(join(dir, 'CLAUDE.md'), 'claude loses');

    const { text } = discoverMemory(dir);
    expect(text).toContain('agents wins');
    expect(text).not.toContain('claude loses');
  });
});

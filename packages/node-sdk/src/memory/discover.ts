import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** The result of discovery: the merged text, plus which files it came from. */
export interface Memory {
  /** Concatenated file contents, each prefixed with a `<!-- From: … -->` header. */
  text: string;
  /** Absolute paths of the files that contributed, in precedence order. */
  sources: string[];
}

/** Filenames we treat as project memory, in per-directory precedence order. */
const MEMORY_FILES = ['AGENTS.md', 'CLAUDE.md'];

/** A soft cap: we never truncate, but we warn past this so prompts stay lean. */
const RECOMMENDED_MAX_BYTES = 32 * 1024;

/**
 * Collect project memory: user-level files first, then every directory from
 * the project root down to `cwd`. Because the descent is root → leaf, the file
 * *nearest* to where you launched lands *last* — and the system prompt tells
 * the model that later, more-specific entries win. Missing files are skipped;
 * an empty result is normal (same discipline as discoverSkills/loadMcpConfig).
 */
export function discoverMemory(cwd = process.cwd()): Memory {
  const seen = new Set<string>();
  const sources: string[] = [];
  const blocks: string[] = [];

  // Read one file and record it, keyed by absolute path so the same file found
  // via two roots is only included once.
  const collect = (path: string): void => {
    const abs = resolve(path);
    if (seen.has(abs)) return;
    let raw: string;
    try {
      raw = readFileSync(abs, 'utf8');
    } catch {
      return; // not there → skip
    }
    seen.add(abs);
    if (raw.trim() === '') return; // blank file contributes nothing
    sources.push(abs);
    blocks.push(`<!-- From: ${abs} -->\n${raw.trim()}`);
  };

  // In one directory, the first of AGENTS.md / CLAUDE.md wins.
  const collectFirst = (dir: string): void => {
    for (const name of MEMORY_FILES) {
      const abs = resolve(join(dir, name));
      try {
        statSync(abs);
      } catch {
        continue; // this name isn't here — try the next
      }
      collect(abs);
      return;
    }
  };

  collectFirst(join(homedir(), '.coding-agent')); // 1. user-level, lowest precedence
  for (const dir of dirsRootToLeaf(cwd)) collectFirst(dir); // 2. project tree, root → leaf

  const text = blocks.join('\n\n');
  if (Buffer.byteLength(text, 'utf8') > RECOMMENDED_MAX_BYTES) {
    // Printed before the alternate screen starts, like discoverSkills' warning.
    console.warn(
      `memory: ${sources.length} file(s) total ` +
        `${Math.round(Buffer.byteLength(text, 'utf8') / 1024)} KB — over the ` +
        `recommended ${RECOMMENDED_MAX_BYTES / 1024} KB; consider trimming AGENTS.md`,
    );
  }
  return { text, sources };
}

/**
 * The directory chain from the project root down to `cwd`, root first. The
 * "project root" is the nearest ancestor containing a `.git`; if there is none,
 * `cwd` is its own root (so a lone AGENTS.md beside you still loads).
 */
function dirsRootToLeaf(cwd: string): string[] {
  const start = resolve(cwd);

  let root = start;
  for (let dir = start; ; ) {
    try {
      statSync(join(dir, '.git'));
      root = dir;
      break;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        root = start; // hit the filesystem root with no .git
        break;
      }
      dir = parent;
    }
  }

  const chain: string[] = [];
  for (let dir = start; ; ) {
    chain.push(dir);
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return chain.reverse(); // leaf → root, reversed to root → leaf
}

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** The outcome of expansion: the prompt to send, and which files were inlined. */
export interface MentionExpansion {
  /** Original text with a `<file>` block appended per resolved mention. */
  prompt: string;
  /** Relative paths that were found and inlined (for on-screen feedback). */
  files: string[];
}

/** `@"quoted path"` (spaces allowed) or `@bare/path` (stops at whitespace). */
const MENTION = /@"([^"]+)"|@([^\s"']+)/g;

/** Per-file cap so `@node_modules/…/huge.js` can't blow the context window. */
const MAX_FILE_BYTES = 64 * 1024;

/**
 * Expand `@path` mentions into inlined file contents. Each resolvable file is
 * appended as `<file path="…">…</file>` after the user's text; a mention that
 * doesn't resolve to a readable file is left as literal text (so an email like
 * `a@b.com` or a stray `@` survives untouched). The display layer shows what
 * you *typed*; only the model sees the expansion — exactly like a slash command
 * (Part 9), where you see `/review x` but the model gets the full template.
 */
export function expandMentions(text: string, cwd = process.cwd()): MentionExpansion {
  const files: string[] = [];
  const blocks: string[] = [];
  const seen = new Set<string>();

  MENTION.lastIndex = 0;
  for (let match = MENTION.exec(text); match !== null; match = MENTION.exec(text)) {
    const quoted = match[1];
    const bare = match[2];
    // Unquoted mentions: trailing sentence punctuation isn't part of the path.
    const path = quoted !== undefined ? quoted : (bare ?? '').replace(/[.,;:!?)]+$/, '');
    if (path === '' || seen.has(path)) continue;

    const abs = resolve(cwd, path);
    let contents: string;
    try {
      if (statSync(abs).isDirectory()) continue; // @dir/ — nothing to inline
      contents = readFileSync(abs, 'utf8');
    } catch {
      continue; // not a readable file → leave the @token literal
    }

    seen.add(path);
    files.push(path);
    const clipped =
      contents.length > MAX_FILE_BYTES
        ? `${contents.slice(0, MAX_FILE_BYTES)}\n… (truncated at ${MAX_FILE_BYTES} bytes)`
        : contents;
    blocks.push(`<file path="${path}">\n${clipped}\n</file>`);
  }

  if (blocks.length === 0) return { prompt: text, files };
  return { prompt: `${text}\n\n${blocks.join('\n\n')}`, files };
}

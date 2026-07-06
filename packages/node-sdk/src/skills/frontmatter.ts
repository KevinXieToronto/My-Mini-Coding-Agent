export interface Frontmatter {
  /** Top-level `key: value` pairs from the header. */
  attributes: Record<string, string>;
  /** Everything after the closing fence — the skill's instructions. */
  body: string;
}

/**
 * Split a `---`-fenced YAML frontmatter header from a Markdown body and read
 * the header's top-level `key: value` pairs. Deliberately minimal: single-line
 * string values only, which is all a skill's `name`/`description` need. The
 * real Kimi Code uses js-yaml for full YAML (lists, nested maps, multi-line
 * strings); we stay dependency-free because a skill header needs nothing more.
 *
 * No frontmatter (or an unterminated fence) → attributes:{}, body: the input.
 */
export function parseFrontmatter(raw: string): Frontmatter {
  const text = raw.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) {
    return { attributes: {}, body: text };
  }
  const close = text.indexOf('\n---', 4);
  if (close === -1) {
    return { attributes: {}, body: text };
  }
  const header = text.slice(4, close);
  // The body starts on the line after the closing fence.
  const newlineAfterFence = text.indexOf('\n', close + 1);
  const body = newlineAfterFence === -1 ? '' : text.slice(newlineAfterFence + 1);

  const attributes: Record<string, string> = {};
  for (const line of header.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue; // blank / comment
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    // Strip one layer of surrounding quotes: name: "x" → x
    const value = trimmed.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    if (key !== '') attributes[key] = value;
  }
  return { attributes, body: body.replace(/^\n+/, '') };
}

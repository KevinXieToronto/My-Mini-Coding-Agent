import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFrontmatter } from '#skills/index';
import type { SlashCommand } from './types';

/**
 * Discover slash commands under a directory: every `*.md` file becomes one
 * command, named after the file (review.md → "review"). A missing directory
 * yields no commands — running without any is normal, not an error (the same
 * posture as discoverSkills and loadMcpConfig).
 *
 * A command with no `description` is skipped with a warning: the description is
 * what `/help` shows, so an un-described command can't be listed usefully.
 */
export function discoverCommands(dir = '.agent/commands'): SlashCommand[] {
  let files: string[];
  try {
    files = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort(); // stable order
  } catch {
    return []; // no commands dir — fine
  }

  const commands: SlashCommand[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const { attributes, body } = parseFrontmatter(readFileSync(path, 'utf8'));
    const name = file.replace(/\.md$/, '');
    const description = attributes['description'];
    if (description === undefined || description === '') {
      console.warn(`command ${path}: missing "description" — skipped`);
      continue;
    }
    commands.push({ name, description, body: body.trim(), path });
  }
  return commands;
}

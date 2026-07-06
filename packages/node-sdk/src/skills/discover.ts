import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFrontmatter } from './frontmatter';
import type { Skill } from './types';

/**
 * Discover skills under a directory: every immediate subfolder that holds a
 * SKILL.md becomes one skill. A missing directory yields no skills — running
 * without any is the normal case, not an error (same posture as loadMcpConfig).
 *
 * A skill with no `description` is skipped with a warning: the description is
 * the *only* thing the model has to decide whether the skill applies, so an
 * un-described skill can't be advertised usefully. The folder name is the
 * fallback `name`, so `name:` in frontmatter is optional.
 */
export function discoverSkills(dir = '.agent/skills'): Skill[] {
  let folders: string[];
  try {
    folders = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(); // stable catalog order
  } catch {
    return []; // no skills dir — fine
  }

  const skills: Skill[] = [];
  for (const folder of folders) {
    const path = join(dir, folder, 'SKILL.md');
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      continue; // a subfolder without a SKILL.md is not a skill
    }
    const { attributes, body } = parseFrontmatter(raw);
    const name = attributes['name'] ?? folder;
    const description = attributes['description'];
    if (description === undefined || description === '') {
      console.warn(`skill ${path}: missing "description" — skipped`);
      continue;
    }
    skills.push({ name, description, body, path });
  }
  return skills;
}

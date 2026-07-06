import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderSkillsCatalog } from './catalog';
import { discoverSkills } from './discover';
import { createSkillTool } from './skill-tool';
import type { Skill } from './types';

const sample: Skill[] = [
  { name: 'add-changeset', description: 'Record a change.', body: 'the full body', path: 'x' },
];

describe('renderSkillsCatalog', () => {
  it('lists names and descriptions but never bodies', () => {
    const catalog = renderSkillsCatalog(sample);
    expect(catalog).toContain('add-changeset');
    expect(catalog).toContain('Record a change.');
    expect(catalog).not.toContain('the full body'); // the body stays out of the prompt
  });

  it('is empty when there are no skills', () => {
    expect(renderSkillsCatalog([])).toBe('');
  });
});

describe('use_skill tool', () => {
  it('returns the body of a known skill', async () => {
    expect(await createSkillTool(sample).execute({ name: 'add-changeset' })).toBe('the full body');
  });

  it('reports an unknown skill with the list of known ones', async () => {
    const out = await createSkillTool(sample).execute({ name: 'nope' });
    expect(out).toContain('no skill named "nope"');
    expect(out).toContain('add-changeset'); // hand the model the real names
  });
});

describe('discoverSkills', () => {
  it('reads each subfolder\'s SKILL.md and parses its frontmatter', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-'));
    mkdirSync(join(root, 'greet'));
    writeFileSync(
      join(root, 'greet', 'SKILL.md'),
      '---\nname: greet\ndescription: Say hello.\n---\nSay hi.\n',
    );
    const skills = discoverSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('greet');
    expect(skills[0]!.description).toBe('Say hello.');
    expect(skills[0]!.body).toBe('Say hi.\n');
  });

  it('returns [] when the directory is absent', () => {
    expect(discoverSkills(join(tmpdir(), 'no-such-skills-dir-xyz'))).toEqual([]);
  });
});

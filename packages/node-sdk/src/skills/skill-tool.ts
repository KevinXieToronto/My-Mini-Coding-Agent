import type { ToolDefinition } from '@kevin.xie.toronto/agent-core';
import { z } from 'zod';

import type { Skill } from './types';

/**
 * The one tool that makes skills work: `use_skill` looks a skill up by name and
 * returns its body — the instructions the catalog deliberately withheld. The
 * model reads the result as its next context and proceeds. This is the entire
 * "load on demand" half of progressive disclosure.
 */
export function createSkillTool(skills: readonly Skill[]): ToolDefinition {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return {
    name: 'use_skill',
    description:
      'Load the full instructions for a skill listed under "Available Skills". ' +
      'Call this the moment a task matches a skill, before doing the work.',
    schema: z.object({
      name: z.string().describe('Exact skill name from the Available Skills list'),
    }),
    async execute({ name }) {
      const skill = byName.get(name);
      if (skill === undefined) {
        const known = [...byName.keys()].join(', ') || '(none)';
        return `Error: no skill named "${name}". Available skills: ${known}`;
      }
      return skill.body;
    },
  };
}

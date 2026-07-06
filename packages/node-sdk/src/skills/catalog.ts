import type { Skill } from './types';

/**
 * Render the catalog appended to the system prompt. Names and descriptions
 * only — never bodies. That's the whole point of progressive disclosure: the
 * model always knows which skills exist (one line each) and pays for a skill's
 * full instructions only when it calls use_skill to load one.
 *
 * Returns '' for no skills, so the caller appends nothing.
 */
export function renderSkillsCatalog(skills: readonly Skill[]): string {
  if (skills.length === 0) return '';
  const list = skills.map((skill) => `- **${skill.name}**: ${skill.description}`);
  return [
    '## Available Skills',
    '',
    'You have skills: pre-written playbooks for specific tasks. When a request',
    'matches one, call the `use_skill` tool with its exact `name` to load the',
    'full step-by-step instructions, then follow them. Do not guess a skill from',
    'its description — load it first. If nothing matches, just work normally.',
    '',
    ...list,
  ].join('\n');
}

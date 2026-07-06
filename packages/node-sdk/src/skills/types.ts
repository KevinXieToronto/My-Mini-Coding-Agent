/**
 * A skill: a named playbook loaded on demand. Discovered from
 * .agent/skills/<folder>/SKILL.md. `name`+`description` are cheap and always
 * advertised (the catalog); `body` is the full instructions, handed over only
 * when the model calls use_skill.
 */
export interface Skill {
  name: string;
  description: string;
  body: string;
  /** Path to the SKILL.md — for diagnostics and (later) resolving siblings. */
  path: string;
}

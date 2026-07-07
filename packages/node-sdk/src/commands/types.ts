/**
 * A slash command: a user-invoked prompt template. Discovered from
 * .agent/commands/<name>.md. Typing `/<name> args…` expands `body` (with the
 * args substituted) into a prompt and runs it. Unlike a skill, the model never
 * sees a command — it is app-side input sugar, not part of the system prompt.
 */
export interface SlashCommand {
  name: string;
  description: string;
  body: string;
  /** Path to the source .md — for diagnostics. */
  path: string;
}

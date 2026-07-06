import type { AgentHarnessOptions } from '#harness';

export type EnvResult =
  | { ok: true; options: AgentHarnessOptions }
  | { ok: false; error: string };

const ENV_HELP = [
  '  export AGENT_API_KEY=sk-...            # required',
  '  export AGENT_BASE_URL=https://api.openai.com/v1   # optional',
  '  export AGENT_MODEL=gpt-4o-mini                    # optional',
  '  export AGENT_LOG_DIR=.agent-logs                  # optional, "" to disable',
].join('\n');

/** Read AGENT_* variables into harness options. Reports, never exits. */
export function loadHarnessOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EnvResult {
  const apiKey = env['AGENT_API_KEY'];
  if (apiKey === undefined || apiKey === '') {
    return { ok: false, error: `AGENT_API_KEY is not set.\n${ENV_HELP}` };
  }

  const logDir = env['AGENT_LOG_DIR'] ?? '.agent-logs';

  return {
    ok: true,
    options: {
      apiKey,
      baseUrl: env['AGENT_BASE_URL'] ?? 'https://api.openai.com/v1',
      model: env['AGENT_MODEL'] ?? 'gpt-4o-mini',
      ...(logDir !== '' && { logDir }),
    },
  };
}

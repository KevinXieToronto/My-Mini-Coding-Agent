import { z } from 'zod';

export const AgentConfigSchema = z.object({
  name: z.string(),
  model: z.string().default('coding-agent-latest'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function createAgent(config: AgentConfig): { greet(): string } {
  return {
    greet: () => `Agent "${config.name}" ready (model: ${config.model})`,
  };
}

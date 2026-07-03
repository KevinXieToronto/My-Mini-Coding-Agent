import { describe, expect, it } from 'vitest';

import { AgentConfigSchema, createAgent } from './index';

describe('createAgent', () => {
  it('greets with its name', () => {
    const config = AgentConfigSchema.parse({ name: 'demo' });
    expect(createAgent(config).greet()).toContain('demo');
  });
});

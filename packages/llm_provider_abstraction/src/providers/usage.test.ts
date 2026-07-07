import { describe, expect, it } from 'vitest';

import { extractUsage } from './openai-compatible';

describe('extractUsage', () => {
  it('maps the wire usage block', () => {
    expect(extractUsage({ prompt_tokens: 120, completion_tokens: 45 })).toEqual({
      inputTokens: 120,
      outputTokens: 45,
    });
  });

  it('defaults missing counts to zero', () => {
    expect(extractUsage({ prompt_tokens: 10 })).toEqual({ inputTokens: 10, outputTokens: 0 });
  });

  it('returns undefined when the block is absent', () => {
    expect(extractUsage(undefined)).toBeUndefined();
  });

  it('treats null (sent on streaming delta chunks) as absent', () => {
    expect(extractUsage(null)).toBeUndefined();
  });
});

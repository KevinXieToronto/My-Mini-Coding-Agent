import { describe, expect, it } from 'vitest';

import { addUsage, costOf, emptyUsage, formatTokens } from './pricing';

describe('usage math', () => {
  it('accumulates field-wise from empty', () => {
    const total = addUsage(addUsage(emptyUsage(), { inputTokens: 10, outputTokens: 5 }), {
      inputTokens: 1,
      outputTokens: 2,
    });
    expect(total).toEqual({ inputTokens: 11, outputTokens: 7 });
  });

  it('prices a known model and zeroes an unknown one', () => {
    // gpt-4o-mini: $0.15 in / $0.60 out per 1M tokens.
    expect(costOf('gpt-4o-mini', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.75);
    expect(costOf('no-such-model', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(0);
  });

  it('formats compact token counts', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1234)).toBe('1.2k');
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});

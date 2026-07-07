import type { TokenUsage } from '@kevin.xie.toronto/llm-provider-abstraction';

/** A zero tally to fold into. */
export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0 };
}

/** Field-wise sum — the reducer behind a running session total. */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Illustrative prices in USD per 1,000,000 tokens. These are *examples* — the
 * real numbers change often and vary by provider and contract. Update this
 * table to your provider's published rates; a model that's absent simply
 * contributes $0 to the meter (its tokens still count).
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'kimi-k2': { input: 0.6, output: 2.5 },
};

/** Dollar cost of one usage tally at a given model's rates (0 if unpriced). */
export function costOf(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICING[model];
  if (price === undefined) return 0;
  return (
    (usage.inputTokens / 1_000_000) * price.input +
    (usage.outputTokens / 1_000_000) * price.output
  );
}

/** Compact human count: 1234 → "1.2k", 2_500_000 → "2.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

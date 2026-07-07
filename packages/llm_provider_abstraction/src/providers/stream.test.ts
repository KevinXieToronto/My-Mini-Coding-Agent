import { describe, expect, it, vi } from 'vitest';

// A realistic OpenAI-style SSE body: content deltas, a finish_reason frame,
// then the include_usage tail chunk — which carries an EMPTY choices array.
// That last detail is the whole point of this test: the usage must be read
// before the `choices` guard, or it gets skipped and the meter reads zero.
vi.mock('undici', () => {
  // Delta chunks carry `usage: null` (as real OpenAI-compatible servers do)
  // until the final tail — reading that null naively throws, so it's covered here.
  const sse =
    'data: {"choices":[{"delta":{"content":"hi"}}],"usage":null}\n\n' +
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":null}\n\n' +
    'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":22,"total_tokens":33}}\n\n' +
    'data: [DONE]\n\n';
  return {
    fetch: vi.fn(async () => ({
      ok: true,
      body: (async function* () {
        yield new TextEncoder().encode(sse);
      })(),
    })),
  };
});

import { createOpenAICompatibleProvider } from './openai-compatible';

describe('stream() usage capture', () => {
  it('captures the include_usage tail chunk despite its empty choices array', async () => {
    const provider = createOpenAICompatibleProvider({
      apiKey: 'unused',
      baseUrl: 'http://unused',
      model: 'gpt-4o',
    });
    const deltas: string[] = [];
    const result = await provider.stream!(
      { messages: [{ role: 'user', content: 'hi' }] },
      (delta) => deltas.push(delta),
    );

    expect(deltas.join('')).toBe('hi');
    expect(result.content).toBe('hi');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
  });
});

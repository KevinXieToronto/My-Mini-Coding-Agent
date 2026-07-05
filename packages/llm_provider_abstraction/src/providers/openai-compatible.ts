import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fetch } from 'undici';

import type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ToolCall,
  StreamDeltaHandler,
} from '#types';

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /**
   * When set, every API call writes its request and response as two
   * separate pretty-printed JSON files in this directory. Omit to disable.
   */
  logDir?: string;
}

interface WireToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface WireResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: WireToolCall[] };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

interface WireDeltaToolCall {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface WireStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: WireDeltaToolCall[] };
    finish_reason?: string | null;
  }>;
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
  }
}

function buildRequestBody(
  options: OpenAICompatibleOptions,
  request: ChatRequest,
  stream: boolean,
): string {
  return JSON.stringify({
    model: options.model,
    messages: request.messages.map(toWireMessage),
    tools: request.tools?.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    temperature: request.temperature,
    stream,
  });
}

const REQUEST_HEADERS = (apiKey: string) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${apiKey}`,
});

function prettyJson(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/**
 * Returns a function that saves one API exchange as two files,
 * `<timestamp>-call-<n>-request.json` and `...-response.json`, under
 * `logDir`. A no-op when `logDir` is undefined; logging failures are
 * swallowed so they can never break the call itself.
 */
function createExchangeLogger(logDir: string | undefined) {
  let seq = 0;
  return async (requestBody: string, response: unknown): Promise<void> => {
    if (logDir === undefined) return;
    seq += 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = `${stamp}-call-${String(seq).padStart(3, '0')}`;
    try {
      await mkdir(logDir, { recursive: true });
      await writeFile(join(logDir, `${prefix}-request.json`), prettyJson(requestBody));
      await writeFile(join(logDir, `${prefix}-response.json`), prettyJson(response));
    } catch {
      // Never let logging break the request.
    }
  };
}

/*
export function createOpenAICompatibleProvider(
  options: OpenAICompatibleOptions,
): ChatProvider {
  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: request.messages.map(toWireMessage),
          tools: request.tools?.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          temperature: request.temperature,
        }),
      });

      const body = (await response.json()) as WireResponse;
      if (!response.ok) {
        throw new Error(
          `LLM request failed (${response.status}): ${body.error?.message ?? 'unknown error'}`,
        );
      }

      const choice = body.choices?.[0];
      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map(
        (call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        }),
      );

      return {
        content: choice?.message?.content ?? null,
        toolCalls,
        finishReason: choice?.finish_reason ?? 'stop',
      };
    },
  };
}
*/

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleOptions,
): ChatProvider {
  const logExchange = createExchangeLogger(options.logDir);

  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const requestBody = buildRequestBody(options, request, false);
      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: REQUEST_HEADERS(options.apiKey),
        body: requestBody,
      });

      const body = (await response.json()) as WireResponse;
      await logExchange(requestBody, body);
      if (!response.ok) {
        throw new Error(
          `LLM request failed (${response.status}): ${body.error?.message ?? 'unknown error'}`,
        );
      }

      const choice = body.choices?.[0];
      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map(
        (call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        }),
      );

      return {
        content: choice?.message?.content ?? null,
        toolCalls,
        finishReason: choice?.finish_reason ?? 'stop',
      };
    },

    async stream(
      request: ChatRequest,
      onDelta: StreamDeltaHandler,
    ): Promise<ChatResponse> {
      const requestBody = buildRequestBody(options, request, true);
      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: REQUEST_HEADERS(options.apiKey),
        body: requestBody,
      });

      if (!response.ok || response.body === null) {
        // Error responses come back as a plain JSON body, not SSE.
        const text = await response.text();
        await logExchange(requestBody, text);
        throw new Error(`LLM request failed (${response.status}): ${text}`);
      }

      let content = '';
      let sawContent = false;
      let finishReason = 'stop';
      // Sparse array indexed by the wire `index`; fragments accumulate in place.
      const partialCalls: ToolCall[] = [];

      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        // A read can end mid-line; keep the trailing partial line in the buffer.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice('data:'.length).trim();
          if (data === '[DONE]') continue;

          const parsed = JSON.parse(data) as WireStreamChunk;
          const choice = parsed.choices?.[0];
          if (choice === undefined) continue;

          if (choice.finish_reason != null) {
            finishReason = choice.finish_reason;
          }

          const textDelta = choice.delta?.content;
          if (textDelta != null && textDelta !== '') {
            sawContent = true;
            content += textDelta;
            onDelta(textDelta);
          }

          for (const deltaCall of choice.delta?.tool_calls ?? []) {
            const current = partialCalls[deltaCall.index] ?? {
              id: '',
              name: '',
              arguments: '',
            };
            if (deltaCall.id !== undefined) current.id = deltaCall.id;
            if (deltaCall.function?.name !== undefined) {
              current.name += deltaCall.function.name;
            }
            if (deltaCall.function?.arguments !== undefined) {
              current.arguments += deltaCall.function.arguments;
            }
            partialCalls[deltaCall.index] = current;
          }
        }
      }

      const result: ChatResponse = {
        content: sawContent ? content : null,
        toolCalls: partialCalls.filter(
          (call): call is ToolCall => call !== undefined,
        ),
        finishReason,
      };
      // For streamed calls the saved response is the assembled result,
      // not the raw SSE frames.
      await logExchange(requestBody, result);
      return result;
    },
  };
}

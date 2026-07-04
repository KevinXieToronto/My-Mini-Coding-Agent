import { fetch } from 'undici';

import type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ToolCall,
} from '#types';

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
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

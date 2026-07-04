// The message shapes every layer of the agent speaks.
// They intentionally mirror the OpenAI chat-completions wire format,
// because that is the de-facto standard every provider understands.

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments, exactly as the model produced it. */
  arguments: string;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

/** A tool the model is allowed to call. `parameters` is a JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
}

export interface ChatResponse {
  /** Assistant text, if any. */
  content: string | null;
  /** Tool calls the model wants executed, if any. */
  toolCalls: ToolCall[];
  /** Why generation stopped: 'stop' | 'tool_calls' | 'length' | ... */
  finishReason: string;
}

/** The single interface agent-core depends on. Everything else is private. */
export interface ChatProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
}

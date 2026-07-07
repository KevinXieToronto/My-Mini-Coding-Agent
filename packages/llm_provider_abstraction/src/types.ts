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

/**
 * Token counts for one model call. We keep the two the wire always reports;
 * total is derived. (The real Kimi Code splits input further into cache-read
 * and cache-creation buckets so it can price a cached prompt differently — a
 * refinement you'd add the day your provider bills cache hits at a discount.)
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResponse {
  /** Assistant text, if any. */
  content: string | null;
  /** Tool calls the model wants executed, if any. */
  toolCalls: ToolCall[];
  /** Why generation stopped: 'stop' | 'tool_calls' | 'length' | ... */
  finishReason: string;
  /** Token usage for this call, when the provider reported it. */
  usage?: TokenUsage;
}

/** Called once per streamed fragment of assistant text. */
export type StreamDeltaHandler = (textDelta: string) => void;

/** The single interface agent-core depends on. Everything else is private. */
export interface ChatProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  /**
   * Optional streaming variant. Emits assistant text fragments through
   * `onDelta` as they arrive, and resolves with the same ChatResponse
   * that chat() would have returned. Providers that cannot stream simply
   * omit this; callers fall back to chat().
   */
  stream?(request: ChatRequest, onDelta: StreamDeltaHandler): Promise<ChatResponse>;
}

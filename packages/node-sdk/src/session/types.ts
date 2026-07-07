import type { ChatMessage } from '@kevin.xie.toronto/llm-provider-abstraction';

/**
 * A saved conversation. `history` is the engine's message array verbatim — the
 * resumable source of truth. Everything else is metadata for listing and
 * choosing which session to resume.
 */
export interface StoredSession {
  /** Directory-safe id; also the filename (`<id>.json`). */
  id: string;
  /** ISO timestamp of first save — stable across resumes. */
  createdAt: string;
  /** ISO timestamp of the most recent save — what listing sorts by. */
  updatedAt: string;
  /** The working directory the session ran in — backs --continue. */
  cwd: string;
  /** The full conversation, exactly as the engine holds it. */
  history: ChatMessage[];
}

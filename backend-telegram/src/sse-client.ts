import { BACKEND_URL } from './config';
import { internalHeaders } from './backendAuth';
import { DEFAULT_LOCALE, type Locale } from '@travel-agent/i18n';
import { t } from './i18n/t';
import { en } from './i18n/locales/en';
import type { TKey } from './i18n/dictionaries';

export type AgentEvent =
  | { type: 'conversation_id'; conversationId: string }
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; error?: string }
  | { type: 'suggestions'; suggestions: string[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * What the backend puts on the wire, which is not what this module yields.
 *
 * Its `error` carries a code and no prose. It used to carry `err.message` —
 * whatever a model provider, a database driver or a tool had thrown — and the
 * bot read it out to the user through `chat.failed`. The sentence the user sees
 * is written here now, from the code.
 */
type WireEvent =
  | Exclude<AgentEvent, { type: 'error' }>
  | { type: 'error'; code?: string };

/**
 * The bot phrase for a backend failure code.
 *
 * Derived from the code rather than looked up in a table, which is the rule the
 * frontend's `errorKeyFor` already follows: `agent_failed` becomes
 * `chat.agentFailed`. A hand-kept table is one more place to remember when a
 * new `AgentErrorCode` is added, and forgetting it is silent — every new
 * failure would read as the general one.
 *
 * A code with no phrase still falls back to the general one, because the
 * backend is deployed separately and may know a code this bot does not.
 */
function backendErrorKey(code: string | undefined): TKey {
  if (!code) return 'chat.agentFailed';
  const key = `chat.${code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
  return key in en ? (key as TKey) : 'chat.agentFailed';
}

export interface Attachment {
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

interface ChatRequest {
  sessionId: string;
  conversationId: string | null;
  message: string;
  agentType: 'travel' | 'shopping';
  attachments?: Attachment[];
  /** Language of the error events this generator yields; defaults to English. */
  locale?: Locale;
}

/**
 * Opens a POST /api/chat SSE stream and yields parsed AgentEvent objects.
 * The caller is responsible for breaking on 'done' or 'error'.
 *
 * Every `error` event that leaves here is a finished, translated string whose
 * variable part is already escaped, so the caller sends it as-is. Running it
 * through `t()` again would escape it twice, and an error quoting a URL would
 * reach the user as `&amp;amp;`. That includes the failures the backend itself
 * reports: they arrive as a code and the sentence is written here, at the one
 * place that knows which half of the sentence is ours and which is not.
 */
export async function* streamChat(req: ChatRequest): AsyncGenerator<AgentEvent> {
  const locale = req.locale ?? DEFAULT_LOCALE;
  const body = JSON.stringify({
    userId: req.sessionId,
    message: req.message,
    agentType: req.agentType,
    platform: 'telegram',
    ...(req.conversationId ? { conversationId: req.conversationId } : {}),
    ...(req.attachments?.length ? { attachments: req.attachments } : {}),
  });

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message: t(locale, 'chat.cannotReachBackend', { message }) };
    yield { type: 'done' };
    return;
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => 'unknown error');
    yield { type: 'error', message: t(locale, 'chat.backendError', { status: response.status, text }) };
    yield { type: 'done' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    // SSE spec: events are separated by double newline
    const parts = buffer.split('\n\n');
    // Last part may be incomplete — keep in buffer
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6);
      try {
        const event = JSON.parse(json) as WireEvent;
        if (event.type === 'error') {
          yield { type: 'error', message: t(locale, backendErrorKey(event.code)) };
          continue;
        }
        yield event;
        if (event.type === 'done') return;
      } catch {
        // malformed line — skip
      }
    }
  }
}

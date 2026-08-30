import { BACKEND_URL } from './config';
import { internalHeaders } from './backendAuth';
import { DEFAULT_LOCALE, type Locale } from './i18n/config';
import { t } from './i18n/t';

export type AgentEvent =
  | { type: 'conversation_id'; conversationId: string }
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; error?: string }
  | { type: 'suggestions'; suggestions: string[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

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
        const event = JSON.parse(json) as AgentEvent;
        yield event;
        if (event.type === 'done') return;
      } catch {
        // malformed line — skip
      }
    }
  }
}

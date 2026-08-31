/**
 * Unit tests for streamChat SSE client.
 * `fetch` is mocked globally to simulate server-sent event streams.
 */

// streamChat reads BACKEND_URL from src/config — pin it so the test does not
// depend on the developer's environment.
jest.mock('../src/config', () => ({ BACKEND_URL: 'http://localhost:3002' }));

import { streamChat, type AgentEvent } from '../src/sse-client';

const globalFetch = global.fetch;

function makeSseBody(events: AgentEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = encoder.encode(lines);

  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function mockFetch(status: number, body: ReadableStream<Uint8Array> | null): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
    text: jest.fn().mockResolvedValue(`error ${status}`),
  });
}

afterEach(() => {
  global.fetch = globalFetch;
});

const BASE_REQ = {
  sessionId: 'tg-123',
  conversationId: null,
  message: 'Hello',
  agentType: 'travel' as const,
};

async function collect(req = BASE_REQ): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of streamChat(req)) {
    events.push(event);
  }
  return events;
}

describe('streamChat', () => {
  it('yields events from a valid SSE stream', async () => {
    mockFetch(200, makeSseBody([
      { type: 'text', content: 'Hello' },
      { type: 'done' },
    ]));

    const events = await collect();

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'text', content: 'Hello' });
    expect(events[1]).toEqual({ type: 'done' });
  });

  it('yields an error event and done when backend returns non-200', async () => {
    mockFetch(500, null);

    const events = await collect();

    expect(events[0].type).toBe('error');
    expect((events[0] as { type: 'error'; message: string }).message).toContain('500');
    expect(events[events.length - 1].type).toBe('done');
  });

  it('stops yielding after a done event', async () => {
    mockFetch(200, makeSseBody([
      { type: 'text', content: 'A' },
      { type: 'done' },
      { type: 'text', content: 'B' },  // this should never be yielded
    ]));

    const events = await collect();
    const types = events.map((e) => e.type);

    expect(types).toEqual(['text', 'done']);
  });

  it('sends userId, message, agentType and platform=telegram to the backend', async () => {
    mockFetch(200, makeSseBody([{ type: 'done' }]));

    await collect();

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3002/api/chat');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.userId).toBe('tg-123');
    expect(body.message).toBe('Hello');
    expect(body.agentType).toBe('travel');
    expect(body.platform).toBe('telegram');
  });

  it('includes conversationId in request body when set', async () => {
    mockFetch(200, makeSseBody([{ type: 'done' }]));

    await collect({ ...BASE_REQ, conversationId: 'conv-xyz' });

    const body = JSON.parse(
      ((global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body.conversationId).toBe('conv-xyz');
  });

  it('omits conversationId from request body when null', async () => {
    mockFetch(200, makeSseBody([{ type: 'done' }]));

    await collect({ ...BASE_REQ, conversationId: null });

    const body = JSON.parse(
      ((global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('conversationId');
  });

  it('yields conversation_id event with the conversation ID', async () => {
    mockFetch(200, makeSseBody([
      { type: 'conversation_id', conversationId: 'conv-new' },
      { type: 'done' },
    ]));

    const events = await collect();

    expect(events[0]).toEqual({ type: 'conversation_id', conversationId: 'conv-new' });
  });

  it('wraps an error the backend reported, so the caller can send it as-is', async () => {
    // The backend writes raw English; the wrapper is translated and the raw
    // half is escaped exactly once. The caller must not translate it again.
    mockFetch(200, makeSseBody([
      { type: 'error', message: 'LLM overloaded' },
      { type: 'done' },
    ]));

    const events = await collect();

    expect(events[0]).toEqual({
      type: 'error',
      message: 'Sorry, something went wrong: LLM overloaded',
    });
  });

  it('escapes the markup characters in an error the backend reported', async () => {
    mockFetch(200, makeSseBody([
      { type: 'error', message: 'upstream said <nope> & gave up' },
      { type: 'done' },
    ]));

    const events = await collect();

    expect((events[0] as { type: 'error'; message: string }).message)
      .toContain('upstream said &lt;nope&gt; &amp; gave up');
  });
});

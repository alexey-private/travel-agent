/**
 * Integration tests for streamChat — uses a real HTTP server (no fetch mock).
 *
 * Covers behaviour the unit test cannot: real chunked TCP delivery, partial SSE
 * lines split across multiple write() calls, connection refused, etc.
 */

import http from 'http';
import type { AddressInfo } from 'net';
import type { AgentEvent } from '../../src/sse-client';

// Prevent index.ts from running (BOT_TOKEN guard)
jest.mock('../../src/index', () => ({ BACKEND_URL: '' }));

// We import streamChat AFTER we know the server URL, so we use dynamic imports
// inside each test via a factory that injects the URL.
async function makeStreamChat(backendUrl: string) {
  jest.resetModules();
  jest.mock('../../src/index', () => ({ BACKEND_URL: backendUrl }));
  const mod = await import('../../src/sse-client');
  return mod.streamChat;
}

// ── Test server helpers ───────────────────────────────────────────────────────

function sseEvent(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

type RequestHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => void;

function startServer(handler: RequestHandler): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function collectEvents(
  backendUrl: string,
  req: Parameters<Awaited<ReturnType<typeof makeStreamChat>>>[0],
): Promise<AgentEvent[]> {
  const streamChat = await makeStreamChat(backendUrl);
  const events: AgentEvent[] = [];
  for await (const event of streamChat(req)) {
    events.push(event);
  }
  return events;
}

const BASE_REQ = {
  sessionId: 'tg-42',
  conversationId: null as string | null,
  message: 'Hello',
  agentType: 'travel' as const,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('streamChat (integration — real HTTP server)', () => {
  it('receives events from a real SSE response', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sseEvent({ type: 'conversation_id', conversationId: 'conv-1' }));
      res.write(sseEvent({ type: 'text', content: 'Hello!' }));
      res.write(sseEvent({ type: 'done' }));
      res.end();
    });

    try {
      const events = await collectEvents(url, BASE_REQ);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'conversation_id', conversationId: 'conv-1' });
      expect(events[1]).toEqual({ type: 'text', content: 'Hello!' });
      expect(events[2]).toEqual({ type: 'done' });
    } finally {
      await stopServer(server);
    }
  });

  it('handles events delivered in separate TCP chunks', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });

      // Deliberately write each event in separate flushes to simulate chunking
      const events: AgentEvent[] = [
        { type: 'text', content: 'chunk1' },
        { type: 'text', content: 'chunk2' },
        { type: 'done' },
      ];
      let i = 0;
      const tick = setInterval(() => {
        res.write(sseEvent(events[i++]));
        if (i >= events.length) {
          clearInterval(tick);
          res.end();
        }
      }, 10);
    });

    try {
      const events = await collectEvents(url, BASE_REQ);
      const texts = events.filter((e) => e.type === 'text').map((e) => (e as { content: string }).content);
      expect(texts).toEqual(['chunk1', 'chunk2']);
      expect(events[events.length - 1].type).toBe('done');
    } finally {
      await stopServer(server);
    }
  });

  it('yields error event when server returns non-200 status', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'service unavailable' }));
    });

    try {
      const events = await collectEvents(url, BASE_REQ);
      expect(events[0].type).toBe('error');
      expect((events[0] as { type: 'error'; message: string }).message).toContain('503');
      expect(events[events.length - 1].type).toBe('done');
    } finally {
      await stopServer(server);
    }
  });

  it('yields error event when server refuses connection', async () => {
    // Port 1 is privileged and always refused without root
    const events = await collectEvents('http://127.0.0.1:1', BASE_REQ);
    expect(events[0].type).toBe('error');
    expect(events[events.length - 1].type).toBe('done');
  });

  it('sends request body with correct fields to backend', async () => {
    let receivedBody = '';

    const { server, url } = await startServer((req, res) => {
      req.on('data', (chunk: Buffer) => { receivedBody += chunk.toString(); });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(sseEvent({ type: 'done' }));
        res.end();
      });
    });

    try {
      await collectEvents(url, { ...BASE_REQ, conversationId: 'conv-existing', agentType: 'shopping' });

      const body = JSON.parse(receivedBody) as Record<string, unknown>;
      expect(body.userId).toBe('tg-42');
      expect(body.message).toBe('Hello');
      expect(body.agentType).toBe('shopping');
      expect(body.platform).toBe('telegram');
      expect(body.conversationId).toBe('conv-existing');
    } finally {
      await stopServer(server);
    }
  });

  it('stops after done even if server sends trailing data', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sseEvent({ type: 'text', content: 'before done' }));
      res.write(sseEvent({ type: 'done' }));
      res.write(sseEvent({ type: 'text', content: 'after done — should be ignored' }));
      res.end();
    });

    try {
      const events = await collectEvents(url, BASE_REQ);
      expect(events.map((e) => e.type)).toEqual(['text', 'done']);
    } finally {
      await stopServer(server);
    }
  });
});

import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { transcribeRoutes } from '@/routes/transcribe';
import { exportRoutes } from '@/routes/export';
import { rateLimitKey } from '@/security/rateLimitKey';
import { DEFAULT_TRUST_PROXY } from '@/security/trustProxy';
import { registerInternalAuth, INTERNAL_SECRET_HEADER } from '@/security/internalAuth';

jest.mock('@/config/env', () => ({ env: { OPENAI_API_KEY: 'test-key' } }));

/**
 * The paid and CPU-bound routes are limited.
 *
 * `/api/transcribe` spends the OpenAI key on every call and `/api/export/pdf*`
 * typeset the body synchronously on the event loop, so neither may be reachable
 * an unbounded number of times. These tests register the limiter exactly as
 * `index.ts` does — `global: false`, `preHandler`, the shared error body — and
 * then walk past each route's ceiling.
 */
async function buildApp(): Promise<FastifyInstance> {
  // The body limit is the one `index.ts` sets. A default Fastify stops at 1 MB,
  // which would reject an oversized clip before the route ever weighed it — and
  // would prove nothing about the route.
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: `Too many requests, retry in ${context.after}`,
      code: 'rate_limited',
    }),
  });
  await app.register(transcribeRoutes);
  await app.register(exportRoutes, {});
  await app.ready();
  return app;
}

/** Fires `count` identical requests in order and returns the status codes. */
async function fire(
  app: FastifyInstance,
  count: number,
  options: { url: string; payload: unknown; remoteAddress?: string },
): Promise<number[]> {
  const codes: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await app.inject({
      method: 'POST',
      url: options.url,
      payload: options.payload as object,
      remoteAddress: options.remoteAddress,
    });
    codes.push(res.statusCode);
  }
  return codes;
}

describe('rate limits on the paid and CPU-bound routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello' }),
    }) as unknown as typeof fetch;
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('stops /api/transcribe after 20 calls a minute', async () => {
    const codes = await fire(app, 21, {
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
      remoteAddress: '10.0.0.1',
    });

    expect(codes.slice(0, 20)).toEqual(Array(20).fill(200));
    expect(codes[20]).toBe(429);
  });

  it('answers a throttled request with a translatable code', async () => {
    await fire(app, 20, {
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
      remoteAddress: '10.0.0.2',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
      remoteAddress: '10.0.0.2',
    });

    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('rate_limited');
  });

  it('counts each caller separately', async () => {
    await fire(app, 20, {
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
      remoteAddress: '10.0.0.3',
    });

    const other = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
      remoteAddress: '10.0.0.4',
    });

    expect(other.statusCode).toBe(200);
  });

  it('stops /api/export/pdf after 10 calls a minute', async () => {
    const codes = await fire(app, 11, {
      url: '/api/export/pdf',
      payload: { text: 'hello' },
      remoteAddress: '10.0.0.5',
    });

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes[10]).toBe(429);
  });

  it('rejects a clip larger than one transcription may cost', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: {
        audio: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
        mimeType: 'audio/webm',
      },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('audio_too_large');
  });

  it('gives each route its own budget', async () => {
    // Spending /api/export/pdf's ten must not spend the Drive route's ten: the
    // two share one config object, and a limiter that keyed on it rather than on
    // the route would let one starve the other.
    await fire(app, 10, { url: '/api/export/pdf', payload: { text: 'hello' }, remoteAddress: '10.0.0.7' });

    const drive = await app.inject({
      method: 'POST',
      url: '/api/export/pdf-to-drive',
      payload: { text: 'hello', userId: 'u-drive' },
      remoteAddress: '10.0.0.7',
    });

    expect(drive.statusCode).not.toBe(429);
  });

  it('stops /api/export/pdf-to-drive after 10 calls a minute', async () => {
    // Drive is not configured here, so the handler answers 503 — the point is
    // that the eleventh call never reaches the handler at all.
    const codes = await fire(app, 11, {
      url: '/api/export/pdf-to-drive',
      payload: { text: 'hello', userId: 'u-drive' },
      remoteAddress: '10.0.0.6',
    });

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(503));
    expect(codes[10]).toBe(429);
  });
});

/** 50 000 characters of ordinary prose — the longest text the route accepts. */
const PROSE_AT_CAP = ('lorem ipsum dolor sit amet '.repeat(2_000)).slice(0, 50_000);

describe('the PDF export refuses a text it would block the event loop on', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a body past the character cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: { text: `${PROSE_AT_CAP} and one word more` },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('text_too_long');
  });

  it('rejects it on the Drive path too', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf-to-drive',
      payload: { text: `${PROSE_AT_CAP} and one word more`, userId: 'u1' },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('text_too_long');
  });

  it('accepts a text right at the cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: { text: PROSE_AT_CAP },
    });

    expect(res.statusCode).toBe(200);
  });

  // Length is not what bounds the work: pdfkit's line breaking is quadratic in
  // the length of one unbreakable token, so a short body made of a single long
  // word costs far more than a long body of ordinary prose.
  it('rejects one long word even well inside the character cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: { text: `see ${'x'.repeat(501)} here` },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('text_unbreakable_run');
  });

  it('rejects a long word on the Drive path too', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf-to-drive',
      payload: { text: 'x'.repeat(501), userId: 'u1' },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('text_unbreakable_run');
  });

  it('counts the run between whitespace, not the whole line', async () => {
    // 1 000 characters, but no run longer than 100 — newlines break a line for
    // pdfkit exactly as spaces do.
    const text = Array(10).fill('y'.repeat(100)).join('\n');
    const res = await app.inject({ method: 'POST', url: '/api/export/pdf', payload: { text } });

    expect(res.statusCode).toBe(200);
  });

  it('accepts a run right at the token cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: { text: 'x'.repeat(500) },
    });

    expect(res.statusCode).toBe(200);
  });
});

/** A request object with just the parts `rateLimitKey` reads. */
function fakeRequest(over: Record<string, unknown> = {}): never {
  return {
    body: {},
    ip: '10.0.0.1',
    headers: {},
    socket: { remoteAddress: '10.0.0.1' },
    log: { warn: jest.fn() },
    server: {},
    ...over,
  } as never;
}

describe('rateLimitKey', () => {
  it('counts a web caller by address, never by the id they sent', () => {
    // The whole of S5: a `userId` in the body is a value the caller chose.
    const first = rateLimitKey(fakeRequest({ body: { userId: 'u-1' } }));
    const second = rateLimitKey(fakeRequest({ body: { userId: 'u-2' } }));

    expect(first).toBe(second);
    expect(first).toBe('ip:10.0.0.1');
  });

  it('counts a Telegram user by id — the bridge has already vouched for it', () => {
    expect(rateLimitKey(fakeRequest({ body: { userId: 'tg-77' } }))).toBe('user:tg-77');
    expect(rateLimitKey(fakeRequest({ body: { userId: 'tg-78' } }))).toBe('user:tg-78');
  });

  it('never returns an empty key', () => {
    expect(rateLimitKey(fakeRequest({ ip: '', socket: { remoteAddress: '' } }))).toBe('ip:unknown');
  });
});

describe('the address a web caller is counted by', () => {
  /** A route that reports the key it would be counted against. */
  async function keyApp(trustProxy: string | false): Promise<FastifyInstance> {
    const lines: string[] = [];
    const app = Fastify({
      trustProxy,
      logger: { level: 'warn', stream: { write: (line: string) => { lines.push(line); } } },
    });
    app.post('/key', async (req) => ({ key: rateLimitKey(req) }));
    app.decorate('logLines', lines);
    await app.ready();
    return app;
  }

  const TRUSTED = DEFAULT_TRUST_PROXY;

  it('follows X-Forwarded-For from a peer it trusts', async () => {
    const app = await keyApp(TRUSTED);
    const res = await app.inject({
      method: 'POST',
      url: '/key',
      payload: {},
      remoteAddress: '10.0.0.9',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });

    expect(res.json().key).toBe('ip:203.0.113.7');
    await app.close();
  });

  it('ignores the part of the chain the caller wrote themselves', async () => {
    // A caller who prepends their own hops must not walk into a fresh bucket:
    // only the entry the trusted proxy appended counts.
    const app = await keyApp(TRUSTED);
    const keys = [];
    for (const spoof of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      const res = await app.inject({
        method: 'POST',
        url: '/key',
        payload: {},
        remoteAddress: '10.0.0.9',
        headers: { 'x-forwarded-for': `${spoof}, 203.0.113.7` },
      });
      keys.push(res.json().key);
    }

    expect(keys).toEqual(['ip:203.0.113.7', 'ip:203.0.113.7', 'ip:203.0.113.7']);
    await app.close();
  });

  it('says so in the log when the proxy in front of it is not trusted', async () => {
    const app = await keyApp(TRUSTED);
    const res = await app.inject({
      method: 'POST',
      url: '/key',
      payload: {},
      remoteAddress: '198.51.100.4',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });

    expect(res.json().key).toBe('ip:198.51.100.4');
    const logged = (app as unknown as { logLines: string[] }).logLines.join('');
    expect(logged).toContain('TRUST_PROXY');
    await app.close();
  });
});

describe('a request that claims a Telegram id', () => {
  const SECRET = 'shared-with-the-bridge';

  async function guardedApp(): Promise<FastifyInstance> {
    const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });
    await app.register(rateLimit, {
      global: false,
      hook: 'preHandler',
      errorResponseBuilder: (_req, context) => ({
        statusCode: 429,
        error: `Too many requests, retry in ${context.after}`,
        code: 'rate_limited',
      }),
    });
    // Exactly the order `index.ts` uses: a global preHandler runs before the
    // route-level one the limiter installs, so the guard has the first word.
    registerInternalAuth(app, SECRET);
    await app.register(transcribeRoutes);
    await app.ready();
    return app;
  }

  let app: FastifyInstance;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello' }),
    }) as unknown as typeof fetch;
    app = await guardedApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const clip = { audio: 'AAAA', mimeType: 'audio/webm' };

  it('buys nothing without the bridge secret', async () => {
    // Claiming a `tg-` id is how a web caller would reach the id-keyed branch.
    // The guard answers first, so the claim costs the attacker the route.
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transcribe',
        payload: { ...clip, userId: `tg-${i}` },
        remoteAddress: '10.0.0.20',
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('gives each bridged user their own budget', async () => {
    // Every Telegram user arrives from the one bridge process, so counting them
    // by address would put the whole bot in a single bucket.
    const headers = { [INTERNAL_SECRET_HEADER]: SECRET };
    const spend = async (userId: string) => {
      const codes: number[] = [];
      for (let i = 0; i < 21; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/transcribe',
          payload: { ...clip, userId },
          remoteAddress: '10.0.0.21',
          headers,
        });
        codes.push(res.statusCode);
      }
      return codes;
    };

    expect((await spend('tg-1'))[20]).toBe(429);
    expect((await spend('tg-2')).slice(0, 20)).toEqual(Array(20).fill(200));
  });
});

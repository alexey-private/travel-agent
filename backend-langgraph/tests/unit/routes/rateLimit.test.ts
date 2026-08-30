import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { transcribeRoutes } from '@/routes/transcribe';
import { exportRoutes } from '@/routes/export';
import { rateLimitKey } from '@/security/rateLimitKey';

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

describe('rateLimitKey', () => {
  it('counts a request against the user it names', () => {
    const req = { body: { userId: 'u-1' }, ip: '10.0.0.1' };
    expect(rateLimitKey(req as never)).toBe('u-1');
  });

  it('falls back to the address when the body names nobody', () => {
    expect(rateLimitKey({ body: {}, ip: '10.0.0.1' } as never)).toBe('10.0.0.1');
    expect(rateLimitKey({ body: null, ip: '10.0.0.1' } as never)).toBe('10.0.0.1');
    expect(rateLimitKey({ ip: '10.0.0.1' } as never)).toBe('10.0.0.1');
  });

  it('ignores a userId that is not a non-empty string', () => {
    expect(rateLimitKey({ body: { userId: '' }, ip: '10.0.0.1' } as never)).toBe('10.0.0.1');
    expect(rateLimitKey({ body: { userId: 42 }, ip: '10.0.0.1' } as never)).toBe('10.0.0.1');
  });

  it('never returns an empty key', () => {
    expect(rateLimitKey({ body: {}, ip: '' } as never)).toBe('unknown');
  });
});

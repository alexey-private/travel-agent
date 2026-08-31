import Fastify, { FastifyInstance, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { allowedOrigins, hijackedCorsHeaders } from '@/security/cors';

/**
 * Who may read this API from a browser.
 *
 * A request carries no credential beyond a `userId` in its body, so the origin
 * check is the whole of the protection: reflecting whatever `Origin` arrives —
 * which is what `origin: true` did — let any page on the web read a user's
 * stream given an id. The streaming route made that worse by deciding the
 * question a second time, by hand, and answering it differently.
 *
 * These tests register the plugin the way `index.ts` does and mount both shapes
 * of route: an ordinary one the plugin answers for, and one that hijacks the
 * reply the way `/api/chat` does.
 */
async function buildApp(allowedOrigin: string | undefined, isProduction = false): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cors, {
    origin: allowedOrigins(allowedOrigin, isProduction),
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  app.get('/plain', async () => ({ ok: true }));
  app.get('/stream', (_req, reply: FastifyReply) => {
    // Exactly the shape `/api/chat` uses: take the socket, then write the
    // headers by hand — including whatever the plugin already decided.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      ...hijackedCorsHeaders(reply),
    });
    reply.raw.end('data: {}\n\n');
  });
  await app.ready();
  return app;
}

/** The `Access-Control-Allow-Origin` both routes hand back to `origin`. */
async function allowOriginHeaders(
  app: FastifyInstance,
  origin: string,
): Promise<{ plain?: string; stream?: string }> {
  const plain = await app.inject({ method: 'GET', url: '/plain', headers: { origin } });
  const stream = await app.inject({ method: 'GET', url: '/stream', headers: { origin } });
  return {
    plain: plain.headers['access-control-allow-origin'] as string | undefined,
    stream: stream.headers['access-control-allow-origin'] as string | undefined,
  };
}

describe('the origins a browser may read this API from', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('answers the configured origin, on the streaming route as well as the plain one', async () => {
    app = await buildApp('https://app.example.com', true);
    const headers = await allowOriginHeaders(app, 'https://app.example.com');
    expect(headers.plain).toBe('https://app.example.com');
    expect(headers.stream).toBe('https://app.example.com');
  });

  it('answers nothing to an origin that is not on the list', async () => {
    // The regression this is here for: the streaming route used to reflect the
    // caller's own origin, so this header used to come back as evil.example.
    app = await buildApp('https://app.example.com', true);
    const headers = await allowOriginHeaders(app, 'https://evil.example');
    expect(headers.plain).toBeUndefined();
    expect(headers.stream).toBeUndefined();
  });

  it('serves more than one front end when the list says so', async () => {
    app = await buildApp('https://app.example.com, https://admin.example.com', true);
    expect((await allowOriginHeaders(app, 'https://admin.example.com')).stream).toBe(
      'https://admin.example.com',
    );
    expect((await allowOriginHeaders(app, 'https://other.example.com')).stream).toBeUndefined();
  });

  it('never claims credentials are allowed', async () => {
    // Nothing here authenticates by cookie, and this header is what would turn a
    // mistake in the list above into a way to read a signed-in user's stream.
    app = await buildApp('https://app.example.com', true);
    const plain = await app.inject({
      method: 'GET',
      url: '/plain',
      headers: { origin: 'https://app.example.com' },
    });
    const stream = await app.inject({
      method: 'GET',
      url: '/stream',
      headers: { origin: 'https://app.example.com' },
    });
    expect(plain.headers['access-control-allow-credentials']).toBeUndefined();
    expect(stream.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('varies on Origin, so a cache cannot serve one origin an answer meant for another', async () => {
    app = await buildApp('https://app.example.com', true);
    const res = await app.inject({
      method: 'GET',
      url: '/stream',
      headers: { origin: 'https://app.example.com' },
    });
    expect(String(res.headers.vary)).toContain('Origin');
  });
});

describe('a development machine with nothing configured', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('allows the frontend on its own port, which is already cross-origin', async () => {
    app = await buildApp(undefined, false);
    expect((await allowOriginHeaders(app, 'http://localhost:3000')).stream).toBe('http://localhost:3000');
    expect((await allowOriginHeaders(app, 'http://127.0.0.1:3000')).plain).toBe('http://127.0.0.1:3000');
  });

  it('allows nothing else — the convenience does not extend to the internet', async () => {
    app = await buildApp(undefined, false);
    expect((await allowOriginHeaders(app, 'https://evil.example')).plain).toBeUndefined();
    // A hostname that merely starts with the allowed one is a different origin.
    expect((await allowOriginHeaders(app, 'http://localhost.evil.example')).plain).toBeUndefined();
  });
});

describe('allowedOrigins', () => {
  it('trusts nothing when production has no list, rather than falling back to localhost', () => {
    // Unreachable while `config/env.ts` requires the variable in production —
    // kept so that removing the requirement cannot quietly reopen the hole.
    expect(allowedOrigins(undefined, true)).toEqual([]);
    expect(allowedOrigins('  ', true)).toEqual([]);
  });

  it('ignores spacing and empty entries in the list', () => {
    expect(allowedOrigins(' https://a.example , , https://b.example ', true)).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});

import Fastify, { FastifyInstance } from 'fastify';
import {
  canonicalPayload,
  INTERNAL_SECRET_HEADER,
  isTelegramUserId,
  registerInternalAuth,
  sign,
  verifySignature,
} from '@/security/internalAuth';

const SECRET = 'a-shared-secret-between-the-two-services';

/**
 * A Telegram session id is derived from a public integer, so — unlike a web
 * session's random UUID — it cannot be the thing that protects the data behind
 * it. These tests pin the boundary: the `tg-` half of the namespace answers only
 * to the bridge, the web half is untouched, and the browser-facing OAuth pair
 * stays reachable because a header cannot travel with a redirect.
 */
async function buildApp(secret: string | undefined): Promise<FastifyInstance> {
  const app = Fastify();
  registerInternalAuth(app, secret);

  app.get<{ Querystring: { userId?: string } }>('/api/settings', async () => ({ ok: 'query' }));
  app.get<{ Params: { userId: string } }>('/api/conversations/:userId', async () => ({ ok: 'params' }));
  app.post('/api/chat', async () => ({ ok: 'body' }));
  app.get('/api/users/telegram', async () => ({ ok: 'bot-only' }));
  app.get('/auth/google/start', async () => ({ ok: 'oauth' }));
  app.get('/health', async () => ({ ok: 'open' }));

  await app.ready();
  return app;
}

describe('isTelegramUserId', () => {
  it('recognises the bot-issued ids and nothing else', () => {
    expect(isTelegramUserId('tg-123456789')).toBe(true);
    expect(isTelegramUserId('tg-anon-8f14e45f')).toBe(true);
    expect(isTelegramUserId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false);
    expect(isTelegramUserId(undefined)).toBe(false);
    expect(isTelegramUserId(12345)).toBe(false);
  });
});

describe('canonicalPayload', () => {
  it('keeps two different tuples apart even when a part contains the separator', () => {
    // Signing `a|b` joined naively cannot tell ['a|b', 'c'] from ['a', 'b|c'],
    // so one signature would vouch for both readings.
    expect(canonicalPayload(['a|b', 'c'])).not.toBe(canonicalPayload(['a', 'b|c']));
  });

  it('is stable for the same tuple', () => {
    expect(canonicalPayload(['tg-42', 'telegram', 1730000000000]))
      .toBe(canonicalPayload(['tg-42', 'telegram', 1730000000000]));
  });

  it('writes a number the same way its string form is written', () => {
    expect(canonicalPayload([7])).toBe(canonicalPayload(['7']));
  });
});

describe('signatures', () => {
  it('accepts what it produced', () => {
    expect(verifySignature('tg-1|telegram|999', sign('tg-1|telegram|999', SECRET), SECRET)).toBe(true);
  });

  it('rejects a different payload, a different secret, and a non-string', () => {
    const signature = sign('tg-1|telegram|999', SECRET);
    expect(verifySignature('tg-2|telegram|999', signature, SECRET)).toBe(false);
    expect(verifySignature('tg-1|telegram|999', signature, 'another-secret')).toBe(false);
    expect(verifySignature('tg-1|telegram|999', undefined, SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on unequal buffer lengths — the guard must not.
    expect(() => verifySignature('payload', 'abc', SECRET)).not.toThrow();
    expect(verifySignature('payload', 'abc', SECRET)).toBe(false);
  });
});

describe('the guard, with a secret configured', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp(SECRET); });
  afterEach(async () => { await app.close(); });

  it('lets a web session id through with no header at all', async () => {
    const res = await app.inject({ url: '/api/settings?userId=3f2504e0-4f89-11d3-9a0c-0305e82c3301' });
    expect(res.statusCode).toBe(200);
  });

  it('leaves a request that names no user alone', async () => {
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
  });

  it.each([
    ['a query string', { url: '/api/settings?userId=tg-123456789' }],
    ['a route parameter', { url: '/api/conversations/tg-123456789' }],
    ['a request body', { method: 'POST' as const, url: '/api/chat', payload: { userId: 'tg-123456789' } }],
  ])('refuses a Telegram id in %s', async (_label, request) => {
    const res = await app.inject(request);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('internal_auth_required');
  });

  it('admits the same requests when the bridge secret is presented', async () => {
    const headers = { [INTERNAL_SECRET_HEADER]: SECRET };
    expect((await app.inject({ url: '/api/settings?userId=tg-1', headers })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/conversations/tg-1', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/chat', payload: { userId: 'tg-1' }, headers })).statusCode).toBe(200);
  });

  it('refuses a wrong secret, including one of a different length', async () => {
    const wrong = await app.inject({ url: '/api/settings?userId=tg-1', headers: { [INTERNAL_SECRET_HEADER]: 'nope' } });
    expect(wrong.statusCode).toBe(403);

    const sameLength = SECRET.slice(0, -1) + 'X';
    const near = await app.inject({ url: '/api/settings?userId=tg-1', headers: { [INTERNAL_SECRET_HEADER]: sameLength } });
    expect(near.statusCode).toBe(403);
  });

  it('closes the enumeration endpoint that hands out every Telegram id', async () => {
    // This one names no user, and was the reason the ids never had to be guessed.
    expect((await app.inject({ url: '/api/users/telegram' })).statusCode).toBe(403);
    expect(
      (await app.inject({ url: '/api/users/telegram', headers: { [INTERNAL_SECRET_HEADER]: SECRET } })).statusCode,
    ).toBe(200);
  });

  it('leaves the browser-facing OAuth route to its own signature check', async () => {
    // A redirect the user follows cannot carry a header; auth.ts verifies a
    // signed link instead. Blanket-refusing here would only stop /connect.
    expect((await app.inject({ url: '/auth/google/start?userId=tg-123456789' })).statusCode).toBe(200);
  });
});

describe('the guard, with no secret configured', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp(undefined); });
  afterEach(async () => { await app.close(); });

  it('fails closed rather than open', async () => {
    const res = await app.inject({ url: '/api/settings?userId=tg-123456789' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('internal_auth_not_configured');
  });

  it('still serves the web half of the namespace', async () => {
    expect((await app.inject({ url: '/api/settings?userId=3f2504e0-4f89-11d3-9a0c-0305e82c3301' })).statusCode).toBe(200);
  });
});

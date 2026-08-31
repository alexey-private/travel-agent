import Fastify, { FastifyInstance } from 'fastify';
import { canonicalPayload, sign } from '@/security/internalAuth';

const generateAuthUrl = jest.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1');
const getToken = jest.fn(async () => ({
  tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: Date.now() + 3600_000 },
}));

jest.mock('googleapis', () => ({
  google: { auth: { OAuth2: jest.fn().mockImplementation(() => ({ generateAuthUrl, getToken })) } },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authRoutes } = require('@/routes/auth') as typeof import('@/routes/auth');

const INTERNAL = 'the-bridge-secret';
const CLIENT_SECRET = 'google-client-secret';
const TG = 'tg-123456789';
const WEB = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const tokenRepo = { get: jest.fn(), save: jest.fn(), delete: jest.fn() };
const userService = { findOrCreateUser: jest.fn(async () => 'internal-uuid') };

/**
 * The consent link is followed by a browser, so the bridge secret cannot ride in
 * a header — it is a signature in the query string instead. Without one, opening
 * `/auth/google/start?userId=tg-<someone else>` would attach the opener's Google
 * account to that person's session, and their agent would start reading and
 * writing the attacker's calendar.
 */
function startLink(userId: string, platform: string, expiresAt: number): string {
  const sig = sign(canonicalPayload([userId, platform, expiresAt]), INTERNAL);
  return `/auth/google/start?userId=${encodeURIComponent(userId)}&platform=${platform}&exp=${expiresAt}&sig=${sig}`;
}

/** No default: passing `undefined` to a defaulted parameter would silently use the default. */
async function buildApp(internalSecret: string | undefined): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(authRoutes, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRepo: tokenRepo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userService: userService as any,
    clientId: 'client-id',
    clientSecret: CLIENT_SECRET,
    redirectUri: 'http://localhost:3002/auth/google/callback',
    internalSecret,
  });
  await app.ready();
  return app;
}

describe('starting a Google consent flow for a Telegram id', () => {
  let app: FastifyInstance;

  beforeEach(async () => { jest.clearAllMocks(); app = await buildApp(INTERNAL); });
  afterEach(async () => { await app.close(); });

  it('redirects when the link carries the bridge signature', async () => {
    const res = await app.inject({ url: startLink(TG, 'telegram', Date.now() + 60_000) });
    expect(res.statusCode).toBe(302);
  });

  it('refuses a link with no signature', async () => {
    const res = await app.inject({ url: `/auth/google/start?userId=${TG}&platform=telegram` });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a signature made with the wrong secret', async () => {
    const expiresAt = Date.now() + 60_000;
    const forged = sign(canonicalPayload([TG, 'telegram', expiresAt]), 'not-the-secret');
    const res = await app.inject({ url: `/auth/google/start?userId=${TG}&platform=telegram&exp=${expiresAt}&sig=${forged}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('internal_auth_required');
  });

  it('refuses a signature lifted from another user id', async () => {
    // The id is part of what is signed, so a valid link cannot be retargeted.
    const expiresAt = Date.now() + 60_000;
    const sig = sign(canonicalPayload(['tg-999', 'telegram', expiresAt]), INTERNAL);
    const res = await app.inject({ url: `/auth/google/start?userId=${TG}&platform=telegram&exp=${expiresAt}&sig=${sig}` });
    expect(res.statusCode).toBe(403);
  });

  it('refuses an expired link', async () => {
    const res = await app.inject({ url: startLink(TG, 'telegram', Date.now() - 1000) });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('connect_link_expired');
  });

  it('refuses a link minted to last far longer than the route allows', async () => {
    const res = await app.inject({ url: startLink(TG, 'telegram', Date.now() + 365 * 24 * 3600_000) });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('connect_link_expired');
  });

  it('leaves web ids exactly as they were — no signature, no expiry', async () => {
    const res = await app.inject({ url: `/auth/google/start?userId=${WEB}` });
    expect(res.statusCode).toBe(302);
  });

  it('refuses Telegram outright when no bridge secret is configured', async () => {
    const unconfigured = await buildApp(undefined);
    const res = await unconfigured.inject({ url: startLink(TG, 'telegram', Date.now() + 60_000) });
    expect(res.statusCode).toBe(503);
    await unconfigured.close();
  });
});

describe('the OAuth state the callback trusts', () => {
  let app: FastifyInstance;

  beforeEach(async () => { jest.clearAllMocks(); app = await buildApp(INTERNAL); });
  afterEach(async () => { await app.close(); });

  /** Reads back the state the route actually handed to Google. */
  function issuedState(): string {
    return (generateAuthUrl.mock.calls[0][0] as unknown as { state: string }).state;
  }

  it('saves the tokens under the id the signed state names', async () => {
    await app.inject({ url: `/auth/google/start?userId=${WEB}` });
    const res = await app.inject({ url: `/auth/google/callback?code=abc&state=${encodeURIComponent(issuedState())}` });

    expect(res.statusCode).toBe(302);
    expect(tokenRepo.save).toHaveBeenCalledWith(WEB, expect.objectContaining({ accessToken: 'at' }));
  });

  it('ignores a state nobody signed', async () => {
    // The whole attack: consent as yourself, then rewrite state to a victim's id.
    const res = await app.inject({ url: `/auth/google/callback?code=abc&state=${encodeURIComponent(TG)}` });
    expect(res.statusCode).toBe(400);
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('ignores a state whose payload was edited after signing', async () => {
    await app.inject({ url: `/auth/google/start?userId=${WEB}` });
    const [payload, signature] = issuedState().split('.');
    const swapped = Buffer.from(JSON.stringify({ userId: TG })).toString('base64url');
    expect(swapped).not.toBe(payload);

    const res = await app.inject({ url: `/auth/google/callback?code=abc&state=${swapped}.${signature}` });
    expect(res.statusCode).toBe(400);
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('round-trips an id containing the separator without splitting it', async () => {
    // The id is an opaque string the client picks. Joined by a bare `|`, one
    // containing `|` would come back with its tail read as the platform tag.
    const awkward = 'web|telegram';
    await app.inject({ url: `/auth/google/start?userId=${encodeURIComponent(awkward)}` });
    const res = await app.inject({ url: `/auth/google/callback?code=abc&state=${encodeURIComponent(issuedState())}` });

    expect(res.statusCode).toBe(302); // the web branch, not the Telegram page
    expect(tokenRepo.save).toHaveBeenCalledWith(awkward, expect.anything());
  });

  it('still tells a Telegram flow apart from a web one', async () => {
    await app.inject({ url: startLink(TG, 'telegram', Date.now() + 60_000) });
    const res = await app.inject({ url: `/auth/google/callback?code=abc&state=${encodeURIComponent(issuedState())}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(tokenRepo.save).toHaveBeenCalledWith(TG, expect.anything());
  });
});

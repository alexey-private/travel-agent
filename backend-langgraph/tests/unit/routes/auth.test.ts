/**
 * Unit tests for Google OAuth2 routes, focused on the platform-aware callback
 * redirect: web-originated flows land on the frontend's /settings page,
 * Telegram-originated flows get a standalone HTML page instead (the bot and
 * web app are independent frontends sharing this backend).
 */

import Fastify, { FastifyInstance } from 'fastify';
import { authRoutes } from '@/routes/auth';
import { canonicalPayload, sign } from '@/security/internalAuth';
import type { GoogleTokenRepository } from '@/repositories/GoogleTokenRepository';
import type { UserService } from '@/services/UserService';

const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
      })),
    },
  },
}));

const CLIENT_SECRET = 'client-secret';
const INTERNAL_SECRET = 'bridge-secret';

/**
 * `state` is signed with the Google client secret, so the callback cannot be
 * pointed at an id nobody consented for. Tests that used to hand-write a state
 * string now have to produce one the route would have issued.
 */
function signedState(userId: string, platform?: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, platform })).toString('base64url');
  return `${payload}.${sign(payload, CLIENT_SECRET)}`;
}

/** A `/connect` link as the bot would mint it: signed over id, platform and expiry. */
function telegramStartUrl(userId: string): string {
  const exp = Date.now() + 60_000;
  const sig = sign(canonicalPayload([userId, 'telegram', exp]), INTERNAL_SECRET);
  return `/auth/google/start?userId=${encodeURIComponent(userId)}&platform=telegram&exp=${exp}&sig=${sig}`;
}

function buildMockTokenRepo(): jest.Mocked<GoogleTokenRepository> {
  return {
    get: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn(),
  } as unknown as jest.Mocked<GoogleTokenRepository>;
}

function buildMockUserService(): jest.Mocked<UserService> {
  return {
    findOrCreateUser: jest.fn().mockResolvedValue('internal-uuid'),
  } as unknown as jest.Mocked<UserService>;
}

async function buildApp(tokenRepo = buildMockTokenRepo(), userService = buildMockUserService()) {
  const app = Fastify({ logger: false });
  await app.register(authRoutes, {
    tokenRepo,
    userService,
    clientId: 'client-id',
    clientSecret: CLIENT_SECRET,
    redirectUri: 'https://backend.example.com/auth/google/callback',
    internalSecret: INTERNAL_SECRET,
  });
  return { app, tokenRepo, userService };
}

beforeEach(() => {
  mockGenerateAuthUrl.mockReset().mockReturnValue('https://accounts.google.com/o/oauth2/consent-url');
  mockGetToken.mockReset().mockResolvedValue({
    tokens: { access_token: 'access-tok', refresh_token: 'refresh-tok', expiry_date: 1234567890 },
  });
  delete process.env.NEXT_PUBLIC_FRONTEND_URL;
});

describe('GET /auth/google/start', () => {
  it('encodes userId alone into state when no platform is given', async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'GET', url: '/auth/google/start?userId=session-abc' });

    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: signedState('session-abc') }),
    );
  });

  it('encodes userId and platform into state when platform is given', async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'GET', url: telegramStartUrl('tg-123') });

    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: signedState('tg-123', 'telegram') }),
    );
  });
});

describe('GET /auth/google/callback', () => {
  it('redirects to the web frontend settings page when state has no platform tag', async () => {
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://frontend.example.com';
    const { app, tokenRepo } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=auth-code&state=${encodeURIComponent(signedState('session-abc'))}`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://frontend.example.com/settings?google_auth=success');
    expect(tokenRepo.save).toHaveBeenCalledWith('session-abc', {
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
      expiryDate: 1234567890,
    });
  });

  it('returns a standalone HTML page instead of redirecting when state is tagged telegram', async () => {
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://frontend.example.com';
    const { app, tokenRepo } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=auth-code&state=${encodeURIComponent(signedState('tg-123', 'telegram'))}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('connected');
    expect(response.body).toContain('Telegram');
    expect(response.body).not.toContain('frontend.example.com');
    expect(tokenRepo.save).toHaveBeenCalledWith('tg-123', expect.any(Object));
  });

  it('renders the telegram error page (with the reason HTML-escaped) instead of redirecting on error', async () => {
    const { app, tokenRepo } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?state=${encodeURIComponent(signedState('tg-123', 'telegram'))}` +
           `&error=${encodeURIComponent('<script>bad</script>')}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).not.toContain('<script>bad</script>');
    expect(response.body).toContain('&lt;script&gt;');
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('still redirects to the web frontend error page when the web flow errors', async () => {
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://frontend.example.com';
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?state=${encodeURIComponent(signedState('session-abc'))}&error=access_denied`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'https://frontend.example.com/settings?google_auth=error&reason=access_denied',
    );
  });
});

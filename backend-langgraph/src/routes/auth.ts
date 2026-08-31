import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';
import { UserService } from '../services/UserService';
import { canonicalPayload, isTelegramUserId, sign, verifySignature } from '../security/internalAuth';

interface AuthRouteOptions {
  tokenRepo: GoogleTokenRepository;
  userService: UserService;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Shared with the bot; absent means Telegram may not start a consent flow. */
  internalSecret?: string;
}

/**
 * How long a `/connect` link stays usable — long enough to read a message, not
 * long enough to hoard. The bot stamps the expiry; this is the ceiling the route
 * will accept for it.
 */
const START_LINK_TTL_MS = 15 * 60 * 1000;

function makeOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// OAuth `state` carries userId plus an optional platform tag, so the callback
// can tell a Telegram-originated flow apart from the web app's — the two are
// independent frontends sharing this backend, and a Telegram user should
// never be dropped onto the web app's /settings page.
//
// It is signed because the callback trusts it: an unsigned state lets anyone
// consent with their own Google account and then rewrite the id it lands on,
// handing their tokens to somebody else's session — whose agent would then be
// reading and writing the attacker's calendar. The key is the Google client
// secret, which is guaranteed present exactly where these routes exist (they
// are registered only when it is configured) and never leaves this server.
//
// The two fields travel as JSON rather than joined by a separator: an id is an
// opaque string the client chooses, so any separator it may itself contain
// makes the boundary a guess, and the reader's guess need not match the
// writer's. JSON has no such seam.
function encodeState(userId: string, platform: string | undefined, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, platform })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function decodeState(state: string | undefined, secret: string): { userId?: string; platform?: string } {
  if (!state) return {};
  const dot = state.lastIndexOf('.');
  if (dot === -1) return {};

  const payload = state.slice(0, dot);
  if (!verifySignature(payload, state.slice(dot + 1), secret)) return {};

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) return {};
    const { userId, platform } = decoded as { userId?: unknown; platform?: unknown };
    return {
      userId: typeof userId === 'string' ? userId : undefined,
      platform: typeof platform === 'string' ? platform : undefined,
    };
  } catch {
    // A signed payload that is not JSON cannot have been written here.
    return {};
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function renderTelegramAuthPage(success: boolean, reason?: string): string {
  const heading = success ? '✅ Google Calendar connected' : '❌ Connection failed';
  const message = success
    ? 'You can close this tab and return to Telegram.'
    : `Something went wrong${reason ? `: ${escapeHtml(reason)}` : ''}. Close this tab and try /connect again in Telegram.`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${heading}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex;
         align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: #fff; padding: 2rem 3rem; border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,.08); text-align: center; max-width: 22rem; }
  h1 { font-size: 1.15rem; margin: 0 0 .5rem; }
  p { color: #555; margin: 0; line-height: 1.4; }
</style></head>
<body><div class="card"><h1>${heading}</h1><p>${message}</p></div></body></html>`;
}

export async function authRoutes(
  fastify: FastifyInstance,
  opts: AuthRouteOptions,
): Promise<void> {
  const { tokenRepo, userService, clientId, clientSecret, redirectUri, internalSecret } = opts;

  // GET /auth/google/status?userId=xxx  — check if connected
  fastify.get<{ Querystring: { userId?: string } }>('/auth/google/status', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ connected: false, error: 'userId required' });
    await userService.findOrCreateUser(userId); // ensure user row exists
    const tokens = await tokenRepo.get(userId);
    return { connected: !!tokens };
  });

  // GET /auth/google/start?userId=xxx&platform=telegram[&exp=…&sig=…]
  //   — redirect to Google consent screen
  //
  // A browser follows this link, so the bridge secret cannot travel in a header
  // here. A `tg-` id instead has to arrive with the bot's signature over it and
  // an expiry: the id itself is public, and without this anyone could open a
  // consent screen that attaches *their* Google account to somebody else's
  // Telegram session. Web ids need none of it — they are unguessable already.
  fastify.get<{ Querystring: { userId?: string; platform?: string; exp?: string; sig?: string } }>('/auth/google/start', async (req, reply) => {
    const { userId, platform, exp, sig } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId is required', code: 'user_id_required' });

    if (isTelegramUserId(userId)) {
      if (!internalSecret) {
        return reply.code(503).send({
          error: 'The Telegram bridge is not configured on this server',
          code: 'internal_auth_not_configured',
        });
      }
      // Both ends of the window are checked. The lower bound is the point: a
      // link stops working. The upper one keeps the lifetime a property of this
      // route rather than of whatever the bot decided to stamp on it.
      const expiresAt = Number(exp);
      const now = Date.now();
      if (!Number.isFinite(expiresAt) || expiresAt < now || expiresAt > now + START_LINK_TTL_MS) {
        return reply.code(403).send({ error: 'This link has expired — run /connect again', code: 'connect_link_expired' });
      }
      if (!verifySignature(canonicalPayload([userId, platform ?? '', exp ?? '']), sig, internalSecret)) {
        return reply.code(403).send({ error: 'This link was not issued by the Telegram bridge', code: 'internal_auth_required' });
      }
    }

    const auth = makeOAuth2Client(clientId, clientSecret, redirectUri);
    const url = auth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/drive.file',
      ],
      state: encodeState(userId, platform, clientSecret),
    });

    return reply.redirect(url);
  });

  // GET /auth/google/callback?code=xxx&state=<signed userId[|platform]>
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      const { userId, platform } = decodeState(state, clientSecret);
      const isTelegram = platform === 'telegram';

      if (error) {
        if (isTelegram) return reply.type('text/html').send(renderTelegramAuthPage(false, error));
        return reply.redirect(
          `${process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'}/settings?google_auth=error&reason=${encodeURIComponent(error)}`,
        );
      }

      if (!code || !userId) {
        return reply.code(400).send({ error: 'Missing code or state' });
      }

      const auth = makeOAuth2Client(clientId, clientSecret, redirectUri);
      const { tokens } = await auth.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        return reply.code(400).send({ error: 'Incomplete tokens from Google' });
      }

      await userService.findOrCreateUser(userId); // ensure user row exists
      await tokenRepo.save(userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date ?? Date.now() + 3600_000,
      });

      if (isTelegram) return reply.type('text/html').send(renderTelegramAuthPage(true));
      return reply.redirect(
        `${process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'}/settings?google_auth=success`,
      );
    },
  );

  // DELETE /auth/google/disconnect?userId=xxx
  fastify.delete<{ Querystring: { userId?: string } }>('/auth/google/disconnect', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId is required' });
    await tokenRepo.delete(userId);
    return { disconnected: true };
  });
}

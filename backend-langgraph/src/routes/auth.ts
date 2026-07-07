import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';
import { UserService } from '../services/UserService';

interface AuthRouteOptions {
  tokenRepo: GoogleTokenRepository;
  userService: UserService;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function makeOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// OAuth `state` carries userId plus an optional platform tag, so the callback
// can tell a Telegram-originated flow apart from the web app's — the two are
// independent frontends sharing this backend, and a Telegram user should
// never be dropped onto the web app's /settings page.
function encodeState(userId: string, platform?: string): string {
  return platform ? `${userId}|${platform}` : userId;
}

function decodeState(state: string | undefined): { userId?: string; platform?: string } {
  if (!state) return {};
  const sep = state.lastIndexOf('|');
  if (sep === -1) return { userId: state };
  return { userId: state.slice(0, sep), platform: state.slice(sep + 1) };
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
  const { tokenRepo, userService, clientId, clientSecret, redirectUri } = opts;

  // GET /auth/google/status?userId=xxx  — check if connected
  fastify.get<{ Querystring: { userId?: string } }>('/auth/google/status', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ connected: false, error: 'userId required' });
    await userService.findOrCreateUser(userId); // ensure user row exists
    const tokens = await tokenRepo.get(userId);
    return { connected: !!tokens };
  });

  // GET /auth/google/start?userId=xxx&platform=telegram  — redirect to Google consent screen
  fastify.get<{ Querystring: { userId?: string; platform?: string } }>('/auth/google/start', async (req, reply) => {
    const { userId, platform } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId is required' });

    const auth = makeOAuth2Client(clientId, clientSecret, redirectUri);
    const url = auth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/drive.file',
      ],
      state: encodeState(userId, platform),
    });

    return reply.redirect(url);
  });

  // GET /auth/google/callback?code=xxx&state=userId[|platform]
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      const { userId, platform } = decodeState(state);
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

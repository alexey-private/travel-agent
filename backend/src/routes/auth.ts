import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';

interface AuthRouteOptions {
  tokenRepo: GoogleTokenRepository;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function makeOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function authRoutes(
  fastify: FastifyInstance,
  opts: AuthRouteOptions,
): Promise<void> {
  const { tokenRepo, clientId, clientSecret, redirectUri } = opts;

  // GET /auth/google/status?userId=xxx  — check if connected
  fastify.get<{ Querystring: { userId?: string } }>('/auth/google/status', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ connected: false, error: 'userId required' });
    const tokens = await tokenRepo.get(userId);
    return { connected: !!tokens };
  });

  // GET /auth/google/start?userId=xxx  — redirect to Google consent screen
  fastify.get<{ Querystring: { userId?: string } }>('/auth/google/start', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId is required' });

    const auth = makeOAuth2Client(clientId, clientSecret, redirectUri);
    const url = auth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/tasks'],
      state: userId,
    });

    return reply.redirect(url);
  });

  // GET /auth/google/callback?code=xxx&state=userId
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    async (req, reply) => {
      const { code, state: userId, error } = req.query;

      if (error) {
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

      await tokenRepo.save(userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date ?? Date.now() + 3600_000,
      });

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

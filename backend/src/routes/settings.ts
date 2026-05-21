import { FastifyInstance } from 'fastify';
import { DAVClient } from 'tsdav';
import { ICloudTokenRepository } from '../repositories/ICloudTokenRepository';
import { UserPreferencesRepository, UserPreferences } from '../repositories/UserPreferencesRepository';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';

interface SettingsRouteOptions {
  icloudTokenRepo: ICloudTokenRepository;
  prefRepo: UserPreferencesRepository;
  googleTokenRepo: GoogleTokenRepository;
}

export async function settingsRoutes(
  fastify: FastifyInstance,
  opts: SettingsRouteOptions,
): Promise<void> {
  const { icloudTokenRepo, prefRepo, googleTokenRepo } = opts;

  // GET /api/settings?userId=xxx
  fastify.get<{ Querystring: { userId?: string } }>('/api/settings', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });

    const prefs = await prefRepo.get(userId);
    const googleConnected = !!(await googleTokenRepo.get(userId));
    const appleConnected = !!(await icloudTokenRepo.get(userId));
    const appleId = appleConnected ? (await icloudTokenRepo.get(userId))?.appleId : null;

    return { ...prefs, googleConnected, appleConnected, appleId };
  });

  // POST /api/settings?userId=xxx  — update preferences
  fastify.post<{
    Querystring: { userId?: string };
    Body: Partial<UserPreferences>;
  }>('/api/settings', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });

    const { calendarProvider, calendarName, shoppingCalendarName, taskListName, shoppingTaskListName } = req.body ?? {};

    if (calendarProvider && calendarProvider !== 'google' && calendarProvider !== 'apple') {
      return reply.code(400).send({ error: 'calendarProvider must be "google" or "apple"' });
    }

    await prefRepo.save(userId, {
      calendarProvider,
      calendarName,
      shoppingCalendarName,
      taskListName,
      shoppingTaskListName,
    });

    return { saved: true };
  });

  // POST /auth/apple/connect?userId=xxx  — save credentials and verify via PROPFIND
  fastify.post<{
    Querystring: { userId?: string };
    Body: { appleId?: string; appPassword?: string };
  }>('/auth/apple/connect', async (req, reply) => {
    const { userId } = req.query;
    const { appleId, appPassword } = req.body ?? {};

    if (!userId) return reply.code(400).send({ error: 'userId required' });
    if (!appleId || !appPassword) return reply.code(400).send({ error: 'appleId and appPassword required' });

    // Verify credentials via CalDAV login
    try {
      const client = new DAVClient({
        serverUrl: 'https://caldav.icloud.com',
        credentials: { username: appleId, password: appPassword },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      await client.login();
    } catch {
      return reply.code(401).send({ error: 'Invalid Apple ID or app-specific password. Make sure you are using an app-specific password from appleid.apple.com.' });
    }

    await icloudTokenRepo.save(userId, { appleId, appPassword });
    return { connected: true };
  });

  // DELETE /auth/apple/disconnect?userId=xxx
  fastify.delete<{ Querystring: { userId?: string } }>('/auth/apple/disconnect', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    await icloudTokenRepo.delete(userId);
    // If user was on apple provider, switch back to google
    const prefs = await prefRepo.get(userId);
    if (prefs.calendarProvider === 'apple') {
      await prefRepo.save(userId, { calendarProvider: 'google' });
    }
    return { disconnected: true };
  });

  // GET /auth/apple/status?userId=xxx
  fastify.get<{ Querystring: { userId?: string } }>('/auth/apple/status', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    const creds = await icloudTokenRepo.get(userId);
    return { connected: !!creds, appleId: creds?.appleId ?? null };
  });
}

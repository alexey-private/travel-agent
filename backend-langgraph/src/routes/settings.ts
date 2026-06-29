import { FastifyInstance } from 'fastify';
import { DAVClient } from 'tsdav';
import { ICloudTokenRepository } from '../repositories/ICloudTokenRepository';
import { UserPreferencesRepository, UserPreferences } from '../repositories/UserPreferencesRepository';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';
import { UserService } from '../services/UserService';

interface SettingsRouteOptions {
  icloudTokenRepo: ICloudTokenRepository;
  prefRepo: UserPreferencesRepository;
  googleTokenRepo: GoogleTokenRepository;
  userService: UserService;
}

export async function settingsRoutes(
  fastify: FastifyInstance,
  opts: SettingsRouteOptions,
): Promise<void> {
  const { icloudTokenRepo, prefRepo, googleTokenRepo, userService } = opts;

  // GET /api/settings?userId=xxx
  fastify.get<{ Querystring: { userId?: string } }>('/api/settings', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    await userService.findOrCreateUser(userId);

    const prefs = await prefRepo.get(userId);
    const googleConnected = !!(await googleTokenRepo.get(userId));
    const icloudCreds = await icloudTokenRepo.get(userId);
    const appleConnected = !!icloudCreds;
    const appleId = icloudCreds?.appleId ?? null;
    const reminderHref = icloudCreds?.reminderHref ?? null;
    const shoppingReminderHref = icloudCreds?.shoppingRemHref ?? null;

    // googleDriveConnected mirrors googleConnected — Drive scope is requested during OAuth.
    // Users connected before Drive scope was added should reconnect to get Drive access.
    return { ...prefs, googleConnected, googleDriveConnected: googleConnected, appleConnected, appleId, reminderHref, shoppingReminderHref };
  });

  // POST /api/settings?userId=xxx  — update preferences
  fastify.post<{
    Querystring: { userId?: string };
    Body: Partial<UserPreferences>;
  }>('/api/settings', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    await userService.findOrCreateUser(userId);

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
    await userService.findOrCreateUser(userId);

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
    await userService.findOrCreateUser(userId);
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
    await userService.findOrCreateUser(userId);
    const creds = await icloudTokenRepo.get(userId);
    return { connected: !!creds, appleId: creds?.appleId ?? null };
  });

  // GET /auth/apple/reminder-lists?userId=xxx — returns VTODO collections visible in Reminders.app
  fastify.get<{ Querystring: { userId?: string } }>('/auth/apple/reminder-lists', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    await userService.findOrCreateUser(userId);
    const creds = await icloudTokenRepo.get(userId);
    if (!creds) return reply.code(400).send({ error: 'Apple iCloud not connected' });

    try {
      const client = new DAVClient({
        serverUrl: 'https://caldav.icloud.com',
        credentials: { username: creds.appleId, password: creds.appPassword },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      await client.login();
      const cals = await client.fetchCalendars();
      // Exclude VTODO collections we created via CalDAV (stored as calendar_href/shopping_cal_href)
      // Those are not real Reminders lists and won't appear in the Reminders app
      const ownCalHrefs = new Set([creds.calendarHref, creds.shoppingCalHref].filter(Boolean));
      const lists = cals
        .filter((c) => c.components?.includes('VTODO') && !ownCalHrefs.has(c.url))
        .map((c) => ({ name: String(c.displayName ?? ''), url: c.url }));
      return { lists };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // POST /auth/apple/reminder-list?userId=xxx — save selected reminder list href
  fastify.post<{
    Querystring: { userId?: string };
    Body: { url?: string; isShoppingList?: boolean };
  }>('/auth/apple/reminder-list', async (req, reply) => {
    const { userId } = req.query;
    const { url, isShoppingList = false } = req.body ?? {};
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    if (!url) return reply.code(400).send({ error: 'url required' });
    await userService.findOrCreateUser(userId);

    if (isShoppingList) {
      await icloudTokenRepo.saveShoppingReminderHref(userId, url);
    } else {
      await icloudTokenRepo.saveReminderHref(userId, url);
    }
    return { saved: true };
  });
}

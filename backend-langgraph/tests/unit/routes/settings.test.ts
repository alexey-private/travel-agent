import Fastify, { FastifyInstance } from 'fastify';
import { settingsRoutes } from '@/routes/settings';

const login = jest.fn();
const fetchCalendars = jest.fn();

jest.mock('tsdav', () => ({
  DAVClient: jest.fn().mockImplementation(() => ({
    login: (...args: unknown[]) => login(...args),
    fetchCalendars: (...args: unknown[]) => fetchCalendars(...args),
  })),
}));

const prefs = {
  calendarProvider: 'google' as const,
  calendarName: 'Travel Agent',
  shoppingCalendarName: 'Shopping',
  taskListName: 'Travel Plans',
  shoppingTaskListName: 'Shopping',
  language: 'he' as const,
};

function buildDeps() {
  return {
    icloudTokenRepo: { get: jest.fn().mockResolvedValue(null) },
    prefRepo: { get: jest.fn().mockResolvedValue(prefs), save: jest.fn().mockResolvedValue(undefined) },
    googleTokenRepo: { get: jest.fn().mockResolvedValue(null) },
    userService: { findOrCreateUser: jest.fn().mockResolvedValue('internal-uuid') },
  };
}

describe('settings routes — language', () => {
  let app: FastifyInstance;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    deps = buildDeps();
    app = Fastify();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(settingsRoutes, deps as any);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the stored language', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings?userId=u1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().language).toBe('he');
  });

  it('saves a supported language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings?userId=u1',
      payload: { language: 'ru' },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.prefRepo.save).toHaveBeenCalledWith('u1', expect.objectContaining({ language: 'ru' }));
  });

  it('rejects an unsupported language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings?userId=u1',
      payload: { language: 'de' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/language/i);
    expect(deps.prefRepo.save).not.toHaveBeenCalled();
  });

  it('accepts a body without a language and leaves it untouched', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings?userId=u1',
      payload: { calendarName: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.prefRepo.save).toHaveBeenCalledWith('u1', expect.objectContaining({ language: undefined }));
  });
});

/**
 * What a failed CalDAV call is allowed to say back.
 *
 * iCloud writes its errors for whoever runs the server, not for the person at
 * the browser: the text can carry the account, the collection URL or the
 * upstream response verbatim. Returning it was free reconnaissance, and it
 * bought nothing — this endpoint's only caller shows a list or shows nothing.
 */
describe('settings routes — a CalDAV failure', () => {
  const CREDS = { appleId: 'someone@icloud.com', appPassword: 'abcd-efgh-ijkl-mnop' };
  /** The shape of a message tsdav can throw: upstream detail plus the account. */
  const UPSTREAM = 'PROPFIND https://p42-caldav.icloud.com/1234567/calendars/ failed: 507 someone@icloud.com';

  let app: FastifyInstance;
  let deps: ReturnType<typeof buildDeps>;
  let logged: string;

  beforeEach(async () => {
    login.mockReset();
    fetchCalendars.mockReset();
    logged = '';
    deps = buildDeps();
    deps.icloudTokenRepo.get.mockResolvedValue(CREDS);
    app = Fastify({
      logger: {
        level: 'error',
        stream: {
          write: (line: string) => {
            logged += line;
          },
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(settingsRoutes, deps as any);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('tells the caller nothing iCloud said', async () => {
    login.mockRejectedValue(new Error(UPSTREAM));

    const res = await app.inject({ method: 'GET', url: '/auth/apple/reminder-lists?userId=u1' });

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('p42-caldav');
    expect(res.body).not.toContain(CREDS.appleId);
    expect(res.json().code).toBe('apple_request_failed');
  });

  it('keeps the detail in the log, where it is useful', async () => {
    login.mockRejectedValue(new Error(UPSTREAM));

    await app.inject({ method: 'GET', url: '/auth/apple/reminder-lists?userId=u1' });

    expect(logged).toContain(UPSTREAM);
  });

  it('still returns the lists when iCloud answers', async () => {
    login.mockResolvedValue(undefined);
    fetchCalendars.mockResolvedValue([
      { displayName: 'Reminders', url: 'https://icloud/lists/1', components: ['VTODO'] },
      { displayName: 'Birthdays', url: 'https://icloud/cal/2', components: ['VEVENT'] },
    ]);

    const res = await app.inject({ method: 'GET', url: '/auth/apple/reminder-lists?userId=u1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().lists).toEqual([{ name: 'Reminders', url: 'https://icloud/lists/1' }]);
  });
});

import Fastify, { FastifyInstance } from 'fastify';
import { settingsRoutes } from '@/routes/settings';

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

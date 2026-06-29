/**
 * Unit tests for the web-push cron notifier.
 *
 * Strategy:
 *   - Mock node-cron.schedule to capture the callback synchronously
 *   - Mock web-push.sendNotification
 *   - Inject a mock Pool and mock CalendarProvider / TasksProvider
 *   - Drive the captured callback directly to test the cron's behaviour
 */

import type { Pool } from 'pg';
import type { CalendarProvider } from '@/tools/providers/CalendarProvider';
import type { TasksProvider } from '@/tools/providers/TasksProvider';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
  },
}));

let capturedCronCallback: (() => Promise<void>) | null = null;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => Promise<void>) => {
    capturedCronCallback = cb;
  }),
}));

const mockSendNotification = jest.fn();
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: mockSendNotification,
}));

// ── Helper builders ───────────────────────────────────────────────────────────

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildPool(rows: object[] = []): jest.Mocked<Pool> {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as jest.Mocked<Pool>;
}

function buildCalendarProvider(
  events: { title: string; date: string; time?: string }[] = [],
): jest.Mocked<CalendarProvider> {
  return {
    list: jest.fn().mockResolvedValue({ success: true, data: { upcoming: events } }),
  } as unknown as jest.Mocked<CalendarProvider>;
}

function buildTasksProvider(
  tasks: { title: string; due?: string; status: string }[] = [],
): jest.Mocked<TasksProvider> {
  return {
    list: jest.fn().mockResolvedValue({ success: true, data: { tasks } }),
  } as unknown as jest.Mocked<TasksProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('startWebPushCron', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    capturedCronCallback = null;
    mockSendNotification.mockReset();
    process.env = {
      ...OLD_ENV,
      VAPID_PUBLIC_KEY: 'test-public-key',
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_EMAIL: 'mailto:test@example.com',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('registers a daily cron and does not throw', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');
    const cron = jest.requireMock('node-cron') as { schedule: jest.Mock };

    startWebPushCron(
      buildPool(),
      buildCalendarProvider(),
      buildTasksProvider(),
    );

    expect(cron.schedule).toHaveBeenCalledWith(
      expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      expect.any(Function),
    );
  });

  it('skips cron registration when VAPID keys are not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const { startWebPushCron } = await import('@/notifier/web-push.cron');
    const cron = jest.requireMock('node-cron') as { schedule: jest.Mock };

    startWebPushCron(buildPool(), buildCalendarProvider(), buildTasksProvider());

    expect(cron.schedule).not.toHaveBeenCalled();
  });

  it('sends notification when user has tomorrow events', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');

    const tomorrow_ = tomorrow();
    const pool = buildPool([
      { id: 'sub-1', session_id: 'tg-123', endpoint: 'https://push.example.com/1', p256dh: 'k1', auth: 'a1' },
    ]);
    const cal = buildCalendarProvider([{ title: 'Team meeting', date: tomorrow_, time: '10:00' }]);
    const tasks = buildTasksProvider([]);

    startWebPushCron(pool, cal, tasks);

    expect(capturedCronCallback).not.toBeNull();
    await capturedCronCallback!();

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const [subscription, payload] = mockSendNotification.mock.calls[0] as [object, string];
    expect(subscription).toMatchObject({ endpoint: 'https://push.example.com/1' });
    const parsed = JSON.parse(payload) as { title: string; body: string };
    expect(parsed.title).toContain("Tomorrow");
    expect(parsed.body).toContain('Team meeting');
  });

  it('sends notification including tasks due tomorrow', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');

    const tomorrow_ = tomorrow();
    const pool = buildPool([
      { id: 'sub-2', session_id: 'tg-456', endpoint: 'https://push.example.com/2', p256dh: 'k2', auth: 'a2' },
    ]);
    const cal = buildCalendarProvider([]);
    const tasks = buildTasksProvider([{ title: 'Buy tickets', due: tomorrow_, status: 'needsAction' }]);

    startWebPushCron(pool, cal, tasks);
    await capturedCronCallback!();

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1] as string) as { body: string };
    expect(payload.body).toContain('Buy tickets');
  });

  it('does not send notification when there is nothing tomorrow', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');

    const pool = buildPool([
      { id: 'sub-3', session_id: 'tg-789', endpoint: 'https://push.example.com/3', p256dh: 'k3', auth: 'a3' },
    ]);
    // Event and task are today, not tomorrow
    const today = new Date().toISOString().slice(0, 10);
    const cal = buildCalendarProvider([{ title: 'Old event', date: today }]);
    const tasks = buildTasksProvider([{ title: 'Old task', due: today, status: 'needsAction' }]);

    startWebPushCron(pool, cal, tasks);
    await capturedCronCallback!();

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not send to users with no subscriptions', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');

    const pool = buildPool([]); // no subscriptions
    const cal = buildCalendarProvider([{ title: 'Event', date: tomorrow() }]);

    startWebPushCron(pool, cal, buildTasksProvider());
    await capturedCronCallback!();

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('cleans up expired subscription (HTTP 410) and continues', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');

    const tomorrow_ = tomorrow();
    const pool = buildPool([
      { id: 'sub-expired', session_id: 'tg-111', endpoint: 'https://expired.example.com', p256dh: 'k', auth: 'a' },
    ]);
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'sub-expired', session_id: 'tg-111', endpoint: 'https://expired.example.com', p256dh: 'k', auth: 'a' }] })
      .mockResolvedValue({ rows: [] }); // DELETE call

    const error = Object.assign(new Error('Gone'), { statusCode: 410 });
    mockSendNotification.mockRejectedValue(error);

    const cal = buildCalendarProvider([{ title: 'Meeting', date: tomorrow_ }]);
    startWebPushCron(pool, cal, buildTasksProvider());
    await expect(capturedCronCallback!()).resolves.toBeUndefined();

    // Should have attempted to delete the stale subscription
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['sub-expired'],
    );
  });

  it('skips completed tasks when filtering', async () => {
    const { startWebPushCron } = await import('@/notifier/web-push.cron');

    const pool = buildPool([
      { id: 'sub-4', session_id: 'tg-222', endpoint: 'https://push.example.com/4', p256dh: 'k4', auth: 'a4' },
    ]);
    const tasks = buildTasksProvider([
      { title: 'Done task', due: tomorrow(), status: 'completed' },
    ]);

    startWebPushCron(pool, buildCalendarProvider(), tasks);
    await capturedCronCallback!();

    // Completed task should be filtered out → nothing to send
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

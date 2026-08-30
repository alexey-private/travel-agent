/**
 * Unit tests for the Telegram calendar cron notifier.
 * Mocks: node-cron (captures callback), fetch (simulates backend API), grammy Api.
 */

// The cron reads BACKEND_URL from src/config — pin it so the test does not
// depend on the developer's environment.
jest.mock('../../src/config', () => ({ BACKEND_URL: 'http://localhost:3002' }));

let capturedCronCallback: (() => Promise<void>) | null = null;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => Promise<void>) => {
    capturedCronCallback = cb;
  }),
}));

import { startCalendarCron } from '../../src/notifier/calendar.cron';
import type { Api } from 'grammy';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildMockApi(): jest.Mocked<Pick<Api, 'sendMessage'>> {
  return { sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }) };
}

const globalFetch = global.fetch;

function mockFetch(responses: Record<string, object>): void {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    for (const [key, value] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(value) });
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

afterEach(() => {
  global.fetch = globalFetch;
  capturedCronCallback = null;
  jest.clearAllMocks();
});

describe('startCalendarCron', () => {
  it('registers a daily cron schedule', () => {
    const cron = jest.requireMock('node-cron') as { schedule: jest.Mock };
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    expect(cron.schedule).toHaveBeenCalledWith(
      expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      expect.any(Function),
    );
  });

  it('sends message when user has events tomorrow', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    const tomorrow_ = tomorrow();
    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-123456'] },
      'calendar/events': { upcoming: [{ id: 'e1', title: 'Team standup', date: tomorrow_, time: '10:00' }] },
      'calendar/tasks': { tasks: [] },
    });

    await capturedCronCallback!();

    expect(api.sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining('Team standup'),
      expect.any(Object),
    );
  });

  it('sends message when user has tasks due tomorrow', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-789012'] },
      'calendar/events': { upcoming: [] },
      'calendar/tasks': { tasks: [{ id: 't1', title: 'Book flights', due: tomorrow(), status: 'needsAction' }] },
    });

    await capturedCronCallback!();

    expect(api.sendMessage).toHaveBeenCalledWith(
      789012,
      expect.stringContaining('Book flights'),
      expect.any(Object),
    );
  });

  it('does not send when there is nothing tomorrow', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    const today = new Date().toISOString().slice(0, 10);
    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-111'] },
      'calendar/events': { upcoming: [{ id: 'e2', title: 'Old event', date: today }] },
      'calendar/tasks': { tasks: [] },
    });

    await capturedCronCallback!();

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send to users with no telegram session IDs', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    mockFetch({
      '/api/users/telegram': { sessionIds: [] },
    });

    await capturedCronCallback!();

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('skips invalid (NaN) telegram IDs gracefully', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-notanumber'] },
      'calendar/events': { upcoming: [{ id: 'e3', title: 'Event', date: tomorrow() }] },
      'calendar/tasks': { tasks: [] },
    });

    await capturedCronCallback!();

    // NaN telegramId → skipped, no sendMessage call
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('does not throw when the backend users endpoint fails', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    await expect(capturedCronCallback!()).resolves.toBeUndefined();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('skips completed tasks', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-222'] },
      'calendar/events': { upcoming: [] },
      'calendar/tasks': { tasks: [{ id: 't2', title: 'Done', due: tomorrow(), status: 'completed' }] },
    });

    await capturedCronCallback!();

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('includes both events and tasks in the notification', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    const tomorrow_ = tomorrow();
    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-333'] },
      'calendar/events': { upcoming: [{ id: 'e4', title: 'Doctor appointment', date: tomorrow_, time: '09:00' }] },
      'calendar/tasks': { tasks: [{ id: 't3', title: 'Pack bag', due: tomorrow_, status: 'needsAction' }] },
    });

    await capturedCronCallback!();

    const messageText = (api.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(messageText).toContain('Doctor appointment');
    expect(messageText).toContain('Pack bag');
  });

  it('writes the reminder in the language stored for the recipient', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-444'] },
      '/api/settings': { language: 'he' },
      'calendar/events': { upcoming: [{ id: 'e5', title: 'Flight to Rome', date: tomorrow(), time: '07:30' }] },
      'calendar/tasks': { tasks: [] },
    });

    await capturedCronCallback!();

    const messageText = (api.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(messageText).toContain('תזכורות למחר');
    expect(messageText).toContain('אירועים');
    // Event titles come from the calendar, so they stay as the user wrote them.
    expect(messageText).toContain('Flight to Rome');
  });

  it('falls back to English when the recipient has no stored language', async () => {
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    mockFetch({
      '/api/users/telegram': { sessionIds: ['tg-555'] },
      '/api/settings': {},
      'calendar/events': { upcoming: [{ id: 'e6', title: 'Standup', date: tomorrow(), time: '10:00' }] },
      'calendar/tasks': { tasks: [] },
    });

    await capturedCronCallback!();

    const messageText = (api.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(messageText).toContain("Tomorrow's reminders");
  });
});

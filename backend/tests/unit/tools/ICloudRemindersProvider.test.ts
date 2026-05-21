jest.mock('tsdav');
jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!!!',
  },
}));

import { ICloudRemindersProvider } from '@/tools/providers/ICloudRemindersProvider';
import { ICloudTokenRepository } from '@/repositories/ICloudTokenRepository';
import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';

const VTODO_ICS = (uid: string, title: string, due?: string, status = 'NEEDS-ACTION') =>
  [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `SUMMARY:${title}`,
    due ? `DUE;VALUE=DATE:${due}` : '',
    `STATUS:${status}`,
    'END:VTODO',
    'END:VCALENDAR',
  ].filter(Boolean).join('\n');

const REMINDER_LIST = {
  url: 'https://caldav.icloud.com/1234567890/lists/travel-plans/',
  displayName: 'Travel Plans',
  components: ['VTODO'],
};

const mockDAVClient = {
  login: jest.fn().mockResolvedValue(undefined),
  fetchCalendars: jest.fn().mockResolvedValue([REMINDER_LIST]),
  fetchCalendarObjects: jest.fn(),
  createCalendarObject: jest.fn().mockResolvedValue(undefined),
  updateCalendarObject: jest.fn().mockResolvedValue(undefined),
  deleteCalendarObject: jest.fn().mockResolvedValue(undefined),
  makeCalendar: jest.fn().mockResolvedValue(undefined),
  account: { homeUrl: 'https://caldav.icloud.com/1234567890/' },
};

const { DAVClient } = jest.requireMock('tsdav') as { DAVClient: jest.Mock };
(DAVClient as jest.Mock).mockImplementation(() => mockDAVClient);

const mockTokenRepo = {
  get: jest.fn().mockResolvedValue({
    appleId: 'test@icloud.com',
    appPassword: 'xxxx-xxxx-xxxx-xxxx',
    reminderHref: REMINDER_LIST.url,
    shoppingRemHref: null,
  }),
  saveReminderHref: jest.fn().mockResolvedValue(undefined),
  saveShoppingReminderHref: jest.fn().mockResolvedValue(undefined),
} as unknown as ICloudTokenRepository;

const mockPrefRepo = {
  get: jest.fn().mockResolvedValue({
    calendarProvider: 'apple',
    calendarName: 'Travel Agent',
    shoppingCalendarName: 'Shopping',
    taskListName: 'Travel Plans',
    shoppingTaskListName: 'Shopping',
  }),
} as unknown as UserPreferencesRepository;

describe('ICloudRemindersProvider', () => {
  let provider: ICloudRemindersProvider;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (mockTokenRepo.get as jest.Mock).mockResolvedValue({
      appleId: 'test@icloud.com',
      appPassword: 'xxxx-xxxx-xxxx-xxxx',
      reminderHref: REMINDER_LIST.url,
      shoppingRemHref: null,
    });
    mockDAVClient.fetchCalendars.mockResolvedValue([REMINDER_LIST]);
    provider = new ICloudRemindersProvider(mockTokenRepo, mockPrefRepo);
  });

  describe('add()', () => {
    it('creates a VTODO and returns success', async () => {
      const result = await provider.add({
        userId,
        title: 'Buy travel adaptor',
        due: '2026-06-05',
      });

      expect(result.success).toBe(true);
      expect((result.data as { title: string }).title).toBe('Buy travel adaptor');
      const call = mockDAVClient.createCalendarObject.mock.calls[0][0];
      expect(call.iCalString).toContain('BEGIN:VTODO');
      expect(call.iCalString).toContain('SUMMARY:Buy travel adaptor');
      expect(call.iCalString).toContain('DUE;VALUE=DATE:20260605');
      expect(call.iCalString).toContain('STATUS:NEEDS-ACTION');
    });

    it('returns error when iCloud not connected', async () => {
      (mockTokenRepo.get as jest.Mock).mockResolvedValue(null);
      const result = await provider.add({ userId, title: 'Test', due: '2026-06-05' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });
  });

  describe('list()', () => {
    it('returns incomplete tasks by default', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([
        { url: `${REMINDER_LIST.url}task1.ics`, data: VTODO_ICS('uid-1', 'Buy adaptor', '20260605') },
        { url: `${REMINDER_LIST.url}task2.ics`, data: VTODO_ICS('uid-2', 'Done task', '20260601', 'COMPLETED') },
      ]);

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
      const tasks = (result.data as { tasks: Array<{ title: string }> }).tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Buy adaptor');
    });

    it('includes completed tasks when includeCompleted=true', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([
        { url: `${REMINDER_LIST.url}task1.ics`, data: VTODO_ICS('uid-1', 'Active', '20260605') },
        { url: `${REMINDER_LIST.url}task2.ics`, data: VTODO_ICS('uid-2', 'Done', '20260601', 'COMPLETED') },
      ]);

      const result = await provider.list({ userId, includeCompleted: true });
      expect((result.data as { tasks: unknown[] }).tasks).toHaveLength(2);
    });
  });

  describe('complete()', () => {
    it('marks task as COMPLETED', async () => {
      const taskIcs = VTODO_ICS('uid-task-1', 'Buy adaptor', '20260605');
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([
        { url: `${REMINDER_LIST.url}uid-task-1.ics`, data: taskIcs, etag: '"abc"' },
      ]);

      const result = await provider.complete({ userId, taskId: 'uid-task-1' });
      expect(result.success).toBe(true);
      expect(mockDAVClient.updateCalendarObject).toHaveBeenCalledTimes(1);
      const updatedICS = mockDAVClient.updateCalendarObject.mock.calls[0][0].calendarObject.data;
      expect(updatedICS).toContain('STATUS:COMPLETED');
    });

    it('returns error when task not found', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([]);
      const result = await provider.complete({ userId, taskId: 'nonexistent' });
      expect(result.success).toBe(false);
    });
  });

  describe('delete()', () => {
    it('deletes task by UID', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([
        { url: `${REMINDER_LIST.url}uid-task-1.ics`, data: VTODO_ICS('uid-task-1', 'Buy adaptor') },
      ]);

      const result = await provider.delete({ userId, taskId: 'uid-task-1' });
      expect(result.success).toBe(true);
      expect(mockDAVClient.deleteCalendarObject).toHaveBeenCalledTimes(1);
    });
  });
});

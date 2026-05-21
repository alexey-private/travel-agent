jest.mock('tsdav');
jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!!!',
  },
}));

import { ICloudCalendarProvider } from '@/tools/providers/ICloudCalendarProvider';
import { ICloudTokenRepository } from '@/repositories/ICloudTokenRepository';
import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';

const mockDAVClient = {
  login: jest.fn().mockResolvedValue(undefined),
  fetchCalendars: jest.fn(),
  fetchCalendarObjects: jest.fn(),
  createCalendarObject: jest.fn().mockResolvedValue(undefined),
  deleteCalendarObject: jest.fn().mockResolvedValue(undefined),
  makeCalendar: jest.fn().mockResolvedValue(undefined),
  account: { homeUrl: 'https://caldav.icloud.com/1234567890/' },
};

const { DAVClient } = jest.requireMock('tsdav') as { DAVClient: jest.Mock };
(DAVClient as jest.Mock).mockImplementation(() => mockDAVClient);

const mockTokenRepo = {
  get: jest.fn(),
  save: jest.fn(),
  saveCalendarHref: jest.fn().mockResolvedValue(undefined),
  saveShoppingCalendarHref: jest.fn().mockResolvedValue(undefined),
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

const TRAVEL_CALENDAR = {
  url: 'https://caldav.icloud.com/1234567890/calendars/travel/',
  displayName: 'Travel Agent',
  components: ['VEVENT'],
};

describe('ICloudCalendarProvider', () => {
  let provider: ICloudCalendarProvider;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (mockTokenRepo.get as jest.Mock).mockResolvedValue({
      appleId: 'test@icloud.com',
      appPassword: 'xxxx-xxxx-xxxx-xxxx',
      calendarHref: TRAVEL_CALENDAR.url,
      shoppingCalHref: null,
    });
    mockDAVClient.fetchCalendars.mockResolvedValue([TRAVEL_CALENDAR]);
    provider = new ICloudCalendarProvider(mockTokenRepo, mockPrefRepo);
  });

  describe('add()', () => {
    it('creates a VEVENT and returns success', async () => {
      const result = await provider.add({
        userId,
        title: 'Flight to Paris',
        date: '2026-06-10',
        category: 'travel',
      });

      expect(result.success).toBe(true);
      expect((result.data as { title: string }).title).toBe('Flight to Paris');
      expect(mockDAVClient.createCalendarObject).toHaveBeenCalledTimes(1);
      const call = mockDAVClient.createCalendarObject.mock.calls[0][0];
      expect(call.iCalString).toContain('BEGIN:VEVENT');
      expect(call.iCalString).toContain('SUMMARY:Flight to Paris');
      expect(call.iCalString).toContain('DTSTART;VALUE=DATE:20260610');
    });

    it('creates a timed event when time is provided', async () => {
      await provider.add({
        userId,
        title: 'Check-in',
        date: '2026-06-10',
        time: '14:30',
        category: 'travel',
      });

      const call = mockDAVClient.createCalendarObject.mock.calls[0][0];
      expect(call.iCalString).toContain('DTSTART:20260610T143000');
    });

    it('returns error when iCloud not connected', async () => {
      (mockTokenRepo.get as jest.Mock).mockResolvedValue(null);
      const result = await provider.add({ userId, title: 'Test', date: '2026-06-01', category: 'travel' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });
  });

  describe('list()', () => {
    it('returns upcoming events parsed from iCalendar', async () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 10);
      const futureDateStr = futureDate.toISOString().slice(0, 10).replace(/-/g, '');

      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../event1.ics',
        data: [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          `UID:abc-123`,
          'SUMMARY:Flight to Paris',
          `DTSTART;VALUE=DATE:${futureDateStr}`,
          `DTEND;VALUE=DATE:${futureDateStr}`,
          'CATEGORIES:travel',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      }]);

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
      const events = (result.data as { events: Array<{ title: string }> }).events;
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Flight to Paris');
    });

    it('filters out past events', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../past.ics',
        data: [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:past-001',
          'SUMMARY:Old Event',
          'DTSTART;VALUE=DATE:20200101',
          'DTEND;VALUE=DATE:20200102',
          'CATEGORIES:travel',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      }]);

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
      expect((result.data as { events: unknown[] }).events).toHaveLength(0);
    });

    it('parses multi-day event endDate (DATE-type DTEND is exclusive)', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../trip.ics',
        data: [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:trip-paris',
          'SUMMARY:Trip to Paris',
          'DTSTART;VALUE=DATE:20260605',
          'DTEND;VALUE=DATE:20260612', // exclusive → inclusive end = 2026-06-11
          'CATEGORIES:travel',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      }]);

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
      type Evt = { title: string; date: string; endDate?: string };
      const events = (result.data as { events: Evt[] }).events;
      expect(events).toHaveLength(1);
      expect(events[0].date).toBe('2026-06-05');
      expect(events[0].endDate).toBe('2026-06-11');
    });

    it('does not set endDate for single-day events', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../single.ics',
        data: [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:single-day',
          'SUMMARY:Quick Meeting',
          'DTSTART;VALUE=DATE:20260610',
          'DTEND;VALUE=DATE:20260611', // exclusive next-day → inclusive = 2026-06-10 = start → omitted
          'CATEGORIES:other',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      }]);

      const result = await provider.list({ userId });
      type Evt = { date: string; endDate?: string };
      const events = (result.data as { events: Evt[] }).events;
      expect(events[0].endDate).toBeUndefined();
    });

    it('parses timed event endDate from DTEND datetime', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../timed.ics',
        data: [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:timed-evt',
          'SUMMARY:Conference',
          'DTSTART:20260610T090000Z',
          'DTEND:20260612T180000Z',
          'CATEGORIES:travel',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      }]);

      const result = await provider.list({ userId });
      type Evt = { date: string; endDate?: string; time?: string };
      const events = (result.data as { events: Evt[] }).events;
      expect(events[0].date).toBe('2026-06-10');
      expect(events[0].endDate).toBe('2026-06-12');
      expect(events[0].time).toBe('09:00');
    });
  });

  describe('delete()', () => {
    it('deletes event by UID and returns success', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../abc-123.ics',
        data: [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:abc-123',
          'SUMMARY:Flight to Paris',
          'DTSTART;VALUE=DATE:20260610',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      }]);

      const result = await provider.delete({ userId, eventId: 'abc-123' });
      expect(result.success).toBe(true);
      expect(mockDAVClient.deleteCalendarObject).toHaveBeenCalledTimes(1);
    });

    it('returns error when event not found', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([]);
      const result = await provider.delete({ userId, eventId: 'nonexistent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('update()', () => {
    const MULTI_DAY_ICS = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:trip-paris',
      'SUMMARY:Trip to Paris',
      'DTSTART;VALUE=DATE:20260605',
      'DTEND;VALUE=DATE:20260612',
      'CATEGORIES:travel',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    beforeEach(() => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([{
        url: 'https://caldav.icloud.com/.../trip-paris.ics',
        data: MULTI_DAY_ICS,
        etag: '"abc"',
      }]);
      (mockDAVClient as Record<string, unknown>).updateCalendarObject = jest.fn().mockResolvedValue(undefined);
    });

    it('preserves existing endDate when not provided in update', async () => {
      const result = await provider.update({
        userId,
        eventId: 'trip-paris',
        title: 'Trip to Paris (Updated)',
      });

      expect(result.success).toBe(true);
      const updatedICS: string = ((mockDAVClient as Record<string, unknown>).updateCalendarObject as jest.Mock).mock.calls[0][0].calendarObject.data;
      // endDate was 2026-06-11 (inclusive) → stored as DTEND 2026-06-12 (exclusive)
      expect(updatedICS).toContain('DTEND;VALUE=DATE:20260612');
      expect(updatedICS).toContain('SUMMARY:Trip to Paris (Updated)');
    });

    it('uses new endDate when provided', async () => {
      const result = await provider.update({
        userId,
        eventId: 'trip-paris',
        endDate: '2026-06-15',
      });

      expect(result.success).toBe(true);
      const updatedICS: string = ((mockDAVClient as Record<string, unknown>).updateCalendarObject as jest.Mock).mock.calls[0][0].calendarObject.data;
      expect(updatedICS).toContain('DTEND;VALUE=DATE:20260616'); // 15 + 1 exclusive
    });

    it('returns error when event not found', async () => {
      mockDAVClient.fetchCalendarObjects.mockResolvedValue([]);
      const result = await provider.update({ userId, eventId: 'nonexistent', title: 'X' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});

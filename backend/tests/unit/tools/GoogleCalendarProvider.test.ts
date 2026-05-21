jest.mock('googleapis');
jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
  },
}));

import { GoogleCalendarProvider } from '@/tools/providers/GoogleCalendarProvider';
import { GoogleTokenRepository } from '@/repositories/GoogleTokenRepository';

const mockTokens = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiryDate: Date.now() + 3600_000,
  calendarId: 'travel-cal-id',
  shoppingCalendarId: 'shopping-cal-id',
};

// Mock calendar API methods
const mockEventsGet = jest.fn();
const mockEventsPatch = jest.fn();
const mockEventsDelete = jest.fn();
const mockEventsInsert = jest.fn();
const mockEventsList = jest.fn();
const mockCalendarListList = jest.fn();
const mockCalendarListInsert = jest.fn();

const mockCalendarClient = {
  events: {
    get: mockEventsGet,
    patch: mockEventsPatch,
    delete: mockEventsDelete,
    insert: mockEventsInsert,
    list: mockEventsList,
  },
  calendarList: { list: mockCalendarListList },
  calendars: { insert: mockCalendarListInsert },
};

const { google } = jest.requireMock('googleapis') as { google: Record<string, unknown> };
(google.auth as Record<string, unknown>) = {
  OAuth2: jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
    on: jest.fn(),
  })),
};
(google.calendar as jest.Mock) = jest.fn().mockReturnValue(mockCalendarClient);

const mockTokenRepo = {
  get: jest.fn().mockResolvedValue(mockTokens),
  save: jest.fn(),
  saveCalendarId: jest.fn(),
  saveShoppingCalendarId: jest.fn(),
} as unknown as GoogleTokenRepository;

describe('GoogleCalendarProvider', () => {
  let provider: GoogleCalendarProvider;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (mockTokenRepo.get as jest.Mock).mockResolvedValue(mockTokens);
    provider = new GoogleCalendarProvider(mockTokenRepo, 'client-id', 'client-secret', 'http://localhost/callback');
  });

  describe('update()', () => {
    it('finds event across all user calendars and patches it', async () => {
      mockCalendarListList.mockResolvedValue({
        data: {
          items: [
            { id: 'cal-1', summary: 'Travel Agent' },
            { id: 'cal-2', summary: 'Shopping' },
          ],
        },
      });
      // Event found in second calendar
      mockEventsGet
        .mockRejectedValueOnce(new Error('Not Found'))
        .mockResolvedValueOnce({ data: { id: 'evt-abc' } });
      mockEventsPatch.mockResolvedValue({
        data: {
          id: 'evt-abc',
          summary: 'Updated Title',
          start: { date: '2026-06-10' },
          htmlLink: 'https://calendar.google.com/...',
        },
      });

      const result = await provider.update({
        userId,
        eventId: 'evt-abc',
        title: 'Updated Title',
        date: '2026-06-10',
      });

      expect(result.success).toBe(true);
      expect(mockEventsPatch).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'cal-2', eventId: 'evt-abc' }),
      );
      expect((result.data as { event: { title: string } }).event.title).toBe('Updated Title');
    });

    it('returns success:false when event not found in any calendar', async () => {
      mockCalendarListList.mockResolvedValue({
        data: { items: [{ id: 'cal-1', summary: 'Travel Agent' }] },
      });
      mockEventsGet.mockRejectedValue(new Error('Not Found'));

      const result = await provider.update({ userId, eventId: 'missing-evt', title: 'X' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns success:false when not connected', async () => {
      (mockTokenRepo.get as jest.Mock).mockResolvedValue(null);
      const result = await provider.update({ userId, eventId: 'evt-1', title: 'X' });
      expect(result.success).toBe(false);
    });

    it('builds all-day start/end when no time provided', async () => {
      mockCalendarListList.mockResolvedValue({
        data: { items: [{ id: 'cal-1', summary: 'Travel Agent' }] },
      });
      mockEventsGet.mockResolvedValue({ data: {} });
      mockEventsPatch.mockResolvedValue({
        data: { id: 'evt-1', summary: 'Trip', start: { date: '2026-06-05' }, htmlLink: '' },
      });

      await provider.update({ userId, eventId: 'evt-1', date: '2026-06-05', endDate: '2026-06-11' });

      const body = mockEventsPatch.mock.calls[0][0].requestBody;
      expect(body.start).toEqual({ date: '2026-06-05' });
      expect(body.end).toEqual({ date: '2026-06-11' });
    });

    it('builds dateTime start/end when time provided', async () => {
      mockCalendarListList.mockResolvedValue({
        data: { items: [{ id: 'cal-1', summary: 'Travel Agent' }] },
      });
      mockEventsGet.mockResolvedValue({ data: {} });
      mockEventsPatch.mockResolvedValue({
        data: { id: 'evt-1', summary: 'Flight', start: { dateTime: '2026-06-05T10:00:00' }, htmlLink: '' },
      });

      await provider.update({ userId, eventId: 'evt-1', date: '2026-06-05', time: '10:00' });

      const body = mockEventsPatch.mock.calls[0][0].requestBody;
      expect(body.start).toEqual({ dateTime: '2026-06-05T10:00:00', timeZone: 'UTC' });
      expect(body.end).toEqual({ dateTime: '2026-06-05T11:00:00', timeZone: 'UTC' });
    });
  });

  describe('delete()', () => {
    it('finds event across all calendars and deletes it', async () => {
      mockCalendarListList.mockResolvedValue({
        data: {
          items: [
            { id: 'cal-1', summary: 'Travel Agent' },
            { id: 'cal-2', summary: 'Shopping' },
          ],
        },
      });
      mockEventsGet
        .mockRejectedValueOnce(new Error('Not Found'))
        .mockResolvedValueOnce({ data: { id: 'evt-abc' } });
      mockEventsDelete.mockResolvedValue({});

      const result = await provider.delete({ userId, eventId: 'evt-abc' });

      expect(result.success).toBe(true);
      expect(mockEventsDelete).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'cal-2', eventId: 'evt-abc' }),
      );
    });

    it('returns success:false when event not found in any calendar', async () => {
      mockCalendarListList.mockResolvedValue({
        data: { items: [{ id: 'cal-1', summary: 'Travel Agent' }] },
      });
      mockEventsGet.mockRejectedValue(new Error('Not Found'));

      const result = await provider.delete({ userId, eventId: 'missing' });
      expect(result.success).toBe(false);
    });
  });

  describe('list()', () => {
    it('returns events from both Travel Agent and Shopping calendars', async () => {
      // getOrCreateCalendarId / getOrCreateShoppingCalendarId both use calendarList.list
      mockCalendarListList.mockResolvedValue({ data: { items: [] } });
      mockCalendarListInsert
        .mockResolvedValueOnce({ data: { id: 'travel-cal-id' } })
        .mockResolvedValueOnce({ data: { id: 'shopping-cal-id' } });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateStr = futureDate.toISOString();

      mockEventsList.mockResolvedValue({
        data: {
          items: [{
            id: 'evt-1',
            summary: 'Flight',
            start: { date: '2026-06-10' },
            description: '',
            htmlLink: '',
          }],
        },
      });

      // Use cached IDs to skip calendar creation
      (mockTokenRepo.get as jest.Mock).mockResolvedValue({
        ...mockTokens,
        calendarId: 'travel-cal-id',
        shoppingCalendarId: 'shopping-cal-id',
      });

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
    });
  });
});

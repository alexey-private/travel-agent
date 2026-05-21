jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
  },
}));

import { UserAwareCalendarProvider } from '@/tools/providers/UserAwareCalendarProvider';
import { CalendarProvider } from '@/tools/providers/CalendarProvider';
import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';

const makeProvider = (): jest.Mocked<CalendarProvider> => ({
  add: jest.fn().mockResolvedValue({ success: true, data: {} }),
  list: jest.fn().mockResolvedValue({ success: true, data: { events: [] } }),
  delete: jest.fn().mockResolvedValue({ success: true, data: {} }),
});

describe('UserAwareCalendarProvider', () => {
  let googleProvider: jest.Mocked<CalendarProvider>;
  let appleProvider: jest.Mocked<CalendarProvider>;
  let prefRepo: jest.Mocked<Pick<UserPreferencesRepository, 'get'>>;
  let provider: UserAwareCalendarProvider;

  const userId = 'test-user';

  beforeEach(() => {
    googleProvider = makeProvider();
    appleProvider = makeProvider();
    prefRepo = { get: jest.fn() } as unknown as jest.Mocked<Pick<UserPreferencesRepository, 'get'>>;
    provider = new UserAwareCalendarProvider(googleProvider, appleProvider, prefRepo as unknown as UserPreferencesRepository);
  });

  it('delegates to Google provider when preference is google', async () => {
    (prefRepo.get as jest.Mock).mockResolvedValue({ calendarProvider: 'google' });
    await provider.add({ userId, title: 'Test', date: '2026-06-10', category: 'travel' });
    expect(googleProvider.add).toHaveBeenCalledTimes(1);
    expect(appleProvider.add).not.toHaveBeenCalled();
  });

  it('delegates to Apple provider when preference is apple', async () => {
    (prefRepo.get as jest.Mock).mockResolvedValue({ calendarProvider: 'apple' });
    await provider.add({ userId, title: 'Test', date: '2026-06-10', category: 'travel' });
    expect(appleProvider.add).toHaveBeenCalledTimes(1);
    expect(googleProvider.add).not.toHaveBeenCalled();
  });

  it('delegates list to the correct provider', async () => {
    (prefRepo.get as jest.Mock).mockResolvedValue({ calendarProvider: 'apple' });
    await provider.list({ userId });
    expect(appleProvider.list).toHaveBeenCalledTimes(1);
  });

  it('delegates delete to the correct provider', async () => {
    (prefRepo.get as jest.Mock).mockResolvedValue({ calendarProvider: 'google' });
    await provider.delete({ userId, eventId: 'evt-1' });
    expect(googleProvider.delete).toHaveBeenCalledTimes(1);
    expect(appleProvider.delete).not.toHaveBeenCalled();
  });

  it('defaults to google when preference is unknown', async () => {
    (prefRepo.get as jest.Mock).mockResolvedValue({ calendarProvider: 'unknown' });
    await provider.list({ userId });
    expect(googleProvider.list).toHaveBeenCalledTimes(1);
  });
});

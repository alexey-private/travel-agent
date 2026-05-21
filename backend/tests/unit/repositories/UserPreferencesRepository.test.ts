jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
  },
}));

import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';
import { Pool } from 'pg';

const mockQuery = jest.fn();
const mockPool = { query: mockQuery } as unknown as Pool;

describe('UserPreferencesRepository', () => {
  let repo: UserPreferencesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserPreferencesRepository(mockPool);
  });

  describe('get()', () => {
    it('returns defaults when no row exists', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const prefs = await repo.get('user-1');
      expect(prefs.calendarProvider).toBe('google');
      expect(prefs.calendarName).toBe('Travel Agent');
      expect(prefs.shoppingCalendarName).toBe('Shopping');
      expect(prefs.taskListName).toBe('Travel Plans');
      expect(prefs.shoppingTaskListName).toBe('Shopping');
    });

    it('returns stored row when exists', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          calendar_provider: 'apple',
          calendar_name: 'My Calendar',
          shopping_calendar_name: 'My Shopping',
          task_list_name: 'My Tasks',
          shopping_task_list_name: 'My Shop Tasks',
        }],
      });
      const prefs = await repo.get('user-1');
      expect(prefs.calendarProvider).toBe('apple');
      expect(prefs.calendarName).toBe('My Calendar');
    });
  });

  describe('save()', () => {
    it('calls upsert with provided values', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await repo.save('user-1', { calendarProvider: 'apple', calendarName: 'My Cal' });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('ON CONFLICT');
      expect(call[1]).toContain('apple');
      expect(call[1]).toContain('My Cal');
    });
  });
});

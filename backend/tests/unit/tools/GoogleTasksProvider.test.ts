jest.mock('googleapis');
jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    NODE_ENV: 'test',
  },
}));

import { GoogleTasksProvider } from '@/tools/providers/GoogleTasksProvider';
import { GoogleTokenRepository } from '@/repositories/GoogleTokenRepository';

const mockTokens = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiryDate: Date.now() + 3600_000,
};

const mockTasksListList = jest.fn();
const mockTasksList = jest.fn();
const mockTasksInsert = jest.fn();
const mockTasksPatch = jest.fn();
const mockTasksDelete = jest.fn();
const mockTasksGet = jest.fn();

const mockTasksClient = {
  tasklists: { list: mockTasksListList, insert: jest.fn() },
  tasks: {
    list: mockTasksList,
    insert: mockTasksInsert,
    patch: mockTasksPatch,
    delete: mockTasksDelete,
    get: mockTasksGet,
  },
};

const { google } = jest.requireMock('googleapis') as { google: Record<string, unknown> };
(google.auth as Record<string, unknown>) = {
  OAuth2: jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
    on: jest.fn(),
  })),
};
(google.tasks as jest.Mock) = jest.fn().mockReturnValue(mockTasksClient);

const mockTokenRepo = {
  get: jest.fn().mockResolvedValue(mockTokens),
  save: jest.fn(),
} as unknown as GoogleTokenRepository;

describe('GoogleTasksProvider', () => {
  let provider: GoogleTasksProvider;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (mockTokenRepo.get as jest.Mock).mockResolvedValue(mockTokens);
    provider = new GoogleTasksProvider(mockTokenRepo, 'client-id', 'client-secret', 'http://localhost/callback');
  });

  describe('list() — no tasklistName', () => {
    it('fetches tasks from all tasklists when no tasklistName specified', async () => {
      mockTasksListList.mockResolvedValue({
        data: {
          items: [
            { id: 'list-travel', title: 'Travel Plans' },
            { id: 'list-shopping', title: 'Shopping' },
          ],
        },
      });
      mockTasksList
        .mockResolvedValueOnce({
          data: {
            items: [{ id: 't1', title: 'Book hotel', notes: '', due: '2026-06-01T00:00:00.000Z', status: 'needsAction' }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [{ id: 't2', title: 'Buy sunscreen', notes: '', due: undefined, status: 'needsAction' }],
          },
        });

      const result = await provider.list({ userId });

      expect(result.success).toBe(true);
      type T = { id: string; title: string; tasklist: string };
      const tasks = (result.data as { tasks: T[] }).tasks;
      expect(tasks).toHaveLength(2);
      expect(tasks.find((t) => t.title === 'Book hotel')?.tasklist).toBe('Travel Plans');
      expect(tasks.find((t) => t.title === 'Buy sunscreen')?.tasklist).toBe('Shopping');
      // Both tasklists queried
      expect(mockTasksList).toHaveBeenCalledTimes(2);
    });

    it('returns empty when all tasklists are empty', async () => {
      mockTasksListList.mockResolvedValue({
        data: { items: [{ id: 'list-1', title: 'My Tasks' }] },
      });
      mockTasksList.mockResolvedValue({ data: { items: [] } });

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
      expect((result.data as { tasks: unknown[] }).tasks).toHaveLength(0);
    });

    it('gracefully skips a tasklist that throws', async () => {
      mockTasksListList.mockResolvedValue({
        data: {
          items: [
            { id: 'list-ok', title: 'Shopping' },
            { id: 'list-err', title: 'Broken' },
          ],
        },
      });
      mockTasksList
        .mockResolvedValueOnce({
          data: { items: [{ id: 't1', title: 'Buy milk', notes: '', due: undefined, status: 'needsAction' }] },
        })
        .mockRejectedValueOnce(new Error('Permission denied'));

      const result = await provider.list({ userId });
      expect(result.success).toBe(true);
      expect((result.data as { tasks: unknown[] }).tasks).toHaveLength(1);
    });
  });

  describe('list() — with tasklistName', () => {
    it('fetches only from the specified tasklist', async () => {
      mockTasksListList.mockResolvedValue({
        data: { items: [{ id: 'list-travel', title: 'Travel Plans' }] },
      });
      mockTasksList.mockResolvedValue({
        data: {
          items: [{ id: 't1', title: 'Book flight', notes: '', due: '2026-06-01T00:00:00.000Z', status: 'needsAction' }],
        },
      });

      const result = await provider.list({ userId, tasklistName: 'Travel Plans' });

      expect(result.success).toBe(true);
      expect(mockTasksList).toHaveBeenCalledTimes(1);
      const tasks = (result.data as { tasks: Array<{ title: string }> }).tasks;
      expect(tasks[0].title).toBe('Book flight');
    });
  });

  describe('add()', () => {
    it('creates task in specified list with due date', async () => {
      mockTasksListList.mockResolvedValue({
        data: { items: [{ id: 'list-travel', title: 'Travel Plans' }] },
      });
      mockTasksInsert.mockResolvedValue({
        data: { id: 'new-task-id', title: 'Pack bags', status: 'needsAction' },
      });

      const result = await provider.add({
        userId,
        title: 'Pack bags',
        due: '2026-06-04',
        tasklistName: 'Travel Plans',
      });

      expect(result.success).toBe(true);
      expect(mockTasksInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tasklist: 'list-travel',
          requestBody: expect.objectContaining({ title: 'Pack bags', due: '2026-06-04T00:00:00.000Z' }),
        }),
      );
    });
  });

  describe('complete()', () => {
    it('marks task as completed', async () => {
      mockTasksListList.mockResolvedValue({
        data: { items: [{ id: 'list-1', title: 'Shopping' }] },
      });
      mockTasksGet.mockResolvedValue({ data: { id: 't1' } });
      mockTasksPatch.mockResolvedValue({
        data: { id: 't1', title: 'Buy milk', status: 'completed' },
      });

      const result = await provider.complete({ userId, taskId: 't1' });

      expect(result.success).toBe(true);
      expect(mockTasksPatch).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { status: 'completed' } }),
      );
    });
  });

  describe('error handling', () => {
    it('returns friendly message for missing Tasks scope (403)', async () => {
      mockTasksListList.mockRejectedValue(new Error('insufficient permission'));

      const result = await provider.list({ userId });
      expect(result.success).toBe(false);
      expect(result.error).toContain('permission');
    });

    it('returns error when not connected', async () => {
      (mockTokenRepo.get as jest.Mock).mockResolvedValue(null);
      const result = await provider.list({ userId });
      expect(result.success).toBe(false);
    });
  });
});

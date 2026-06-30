import { DriveFilesTool } from '@/tools/DriveFilesTool';
import type { DriveProvider } from '@/tools/providers/DriveProvider';

// ── Mock provider ─────────────────────────────────────────────────────────────

const mockList   = jest.fn();
const mockSearch = jest.fn();
const mockRead   = jest.fn();
const mockCreate = jest.fn();

const mockProvider: DriveProvider = {
  list: mockList,
  search: mockSearch,
  read: mockRead,
  create: mockCreate,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DriveFilesTool', () => {
  let tool: DriveFilesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new DriveFilesTool(mockProvider);
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('action: list', () => {
    it('delegates to provider.list with userId', async () => {
      mockList.mockResolvedValue({ success: true, data: { files: [], total: 0 } });

      await tool.execute({ action: 'list', userId: 'user-1' });

      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    });

    it('defaults pageSize to 20', async () => {
      mockList.mockResolvedValue({ success: true, data: { files: [] } });

      await tool.execute({ action: 'list', userId: 'user-1' });

      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 20 }));
    });

    it('caps pageSize at 50', async () => {
      mockList.mockResolvedValue({ success: true, data: { files: [] } });

      await tool.execute({ action: 'list', userId: 'user-1', pageSize: 999 });

      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));
    });
  });

  // ── search ────────────────────────────────────────────────────────────────

  describe('action: search', () => {
    it('delegates to provider.search with query', async () => {
      mockSearch.mockResolvedValue({ success: true, data: { files: [] } });

      await tool.execute({ action: 'search', userId: 'user-1', query: 'Paris' });

      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', query: 'Paris' }));
    });

    it('returns error when query is missing', async () => {
      const result = await tool.execute({ action: 'search', userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/query.*required/i);
    });

    it('caps pageSize at 50', async () => {
      mockSearch.mockResolvedValue({ success: true, data: { files: [] } });

      await tool.execute({ action: 'search', userId: 'user-1', query: 'trip', pageSize: 100 });

      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));
    });
  });

  // ── read ──────────────────────────────────────────────────────────────────

  describe('action: read', () => {
    it('delegates to provider.read with fileId', async () => {
      mockRead.mockResolvedValue({ success: true, data: { content: 'hello' } });

      await tool.execute({ action: 'read', userId: 'user-1', fileId: 'file-abc' });

      expect(mockRead).toHaveBeenCalledWith({ userId: 'user-1', fileId: 'file-abc' });
    });

    it('returns error when fileId is missing', async () => {
      const result = await tool.execute({ action: 'read', userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/fileId.*required/i);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('action: create', () => {
    it('delegates to provider.create with name and content', async () => {
      mockCreate.mockResolvedValue({ success: true, data: { file: { id: 'f1' } } });

      await tool.execute({ action: 'create', userId: 'user-1', name: 'Paris trip.txt', content: 'Day 1...' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', name: 'Paris trip.txt', content: 'Day 1...' }),
      );
    });

    it('passes optional mimeType to provider', async () => {
      mockCreate.mockResolvedValue({ success: true, data: {} });

      await tool.execute({ action: 'create', userId: 'user-1', name: 'data.csv', content: 'a,b', mimeType: 'text/csv' });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'text/csv' }));
    });

    it('returns error when name is missing', async () => {
      const result = await tool.execute({ action: 'create', userId: 'user-1', content: 'hello' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/name.*required/i);
    });

    it('returns error when content is missing', async () => {
      const result = await tool.execute({ action: 'create', userId: 'user-1', name: 'file.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/content.*required/i);
    });
  });

  // ── unknown action ────────────────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns error for unrecognised action', async () => {
      const result = await tool.execute({ action: 'delete', userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unknown action/i);
    });
  });

  // ── defaults to MockDriveProvider ─────────────────────────────────────────

  describe('default provider', () => {
    it('uses MockDriveProvider when no provider passed', async () => {
      const defaultTool = new DriveFilesTool();

      const result = await defaultTool.execute({ action: 'list', userId: 'user-x' });

      expect(result.success).toBe(true);
    });

    it('create → list round-trip works with default mock', async () => {
      const defaultTool = new DriveFilesTool();

      await defaultTool.execute({ action: 'create', userId: 'user-x', name: 'test.txt', content: 'hello' });
      const result = await defaultTool.execute({ action: 'list', userId: 'user-x' });

      expect(result.success).toBe(true);
    });
  });
});

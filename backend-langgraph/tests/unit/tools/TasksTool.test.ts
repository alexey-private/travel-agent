/**
 * Unit tests for TasksTool — action routing, date validation, and MISSING_DUE_DATE guard.
 */

import { TasksTool } from '@/tools/TasksTool';
import type { TasksProvider } from '@/tools/providers/TasksProvider';

// ── Mock provider ─────────────────────────────────────────────────────────────

const mockAdd = jest.fn();
const mockList = jest.fn();
const mockComplete = jest.fn();
const mockDelete = jest.fn();
const mockUpdate = jest.fn();

const mockProvider: TasksProvider = {
  add: mockAdd,
  list: mockList,
  complete: mockComplete,
  delete: mockDelete,
  update: mockUpdate,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('TasksTool', () => {
  let tool: TasksTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new TasksTool(mockProvider);
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('action: add', () => {
    it('delegates to provider.add with all provided fields', async () => {
      mockAdd.mockResolvedValue({ success: true, data: { taskId: 'task-1' } });

      await tool.execute({
        action: 'add',
        userId: 'user-1',
        title: 'Book flight to Tokyo',
        due: '2026-07-01',
        tasklistName: 'Travel Plans',
        notes: 'Check luggage allowance',
      });

      expect(mockAdd).toHaveBeenCalledWith({
        userId: 'user-1',
        title: 'Book flight to Tokyo',
        due: '2026-07-01',
        tasklistName: 'Travel Plans',
        notes: 'Check luggage allowance',
      });
    });

    it('returns error when title is missing', async () => {
      const result = await tool.execute({ action: 'add', userId: 'user-1', due: '2026-07-01' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/title.*required/i);
    });

    it('returns MISSING_DUE_DATE error when due is absent', async () => {
      const result = await tool.execute({ action: 'add', userId: 'user-1', title: 'Book flight' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/MISSING_DUE_DATE/);
    });

    it('returns error for non-ISO due date format (MM/DD/YYYY)', async () => {
      const result = await tool.execute({
        action: 'add', userId: 'user-1', title: 'Book', due: '07/01/2026',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid due date/i);
    });

    it('does not call provider when validation fails', async () => {
      await tool.execute({ action: 'add', userId: 'user-1', title: 'Book' });
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('action: list', () => {
    it('delegates to provider.list', async () => {
      mockList.mockResolvedValue({ success: true, data: [] });

      await tool.execute({
        action: 'list', userId: 'user-1', tasklistName: 'Travel Plans', includeCompleted: true,
      });

      expect(mockList).toHaveBeenCalledWith({
        userId: 'user-1',
        tasklistName: 'Travel Plans',
        includeCompleted: true,
      });
    });
  });

  // ── complete ──────────────────────────────────────────────────────────────

  describe('action: complete', () => {
    it('delegates to provider.complete with userId and taskId', async () => {
      mockComplete.mockResolvedValue({ success: true });

      await tool.execute({ action: 'complete', userId: 'user-1', taskId: 'task-1' });

      expect(mockComplete).toHaveBeenCalledWith({
        userId: 'user-1',
        taskId: 'task-1',
        tasklistName: undefined,
      });
    });

    it('returns error when taskId is missing', async () => {
      const result = await tool.execute({ action: 'complete', userId: 'user-1' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/taskId.*required/i);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('action: delete', () => {
    it('delegates to provider.delete', async () => {
      mockDelete.mockResolvedValue({ success: true });

      await tool.execute({ action: 'delete', userId: 'user-1', taskId: 'task-2' });

      expect(mockDelete).toHaveBeenCalledWith({
        userId: 'user-1',
        taskId: 'task-2',
        tasklistName: undefined,
      });
    });

    it('returns error when taskId is missing', async () => {
      const result = await tool.execute({ action: 'delete', userId: 'user-1' });
      expect(result.success).toBe(false);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('action: update', () => {
    it('delegates to provider.update with changed fields', async () => {
      mockUpdate.mockResolvedValue({ success: true });

      await tool.execute({
        action: 'update',
        userId: 'user-1',
        taskId: 'task-1',
        title: 'Book return flight',
        due: '2026-07-15',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', title: 'Book return flight', due: '2026-07-15' }),
      );
    });

    it('returns error when taskId is missing', async () => {
      const result = await tool.execute({ action: 'update', userId: 'user-1', title: 'New title' });
      expect(result.success).toBe(false);
    });

    it('validates due date format in update', async () => {
      const result = await tool.execute({
        action: 'update', userId: 'user-1', taskId: 'task-1', due: 'next tuesday',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid due date/i);
    });

    it('accepts a valid due date in update', async () => {
      mockUpdate.mockResolvedValue({ success: true });
      const result = await tool.execute({
        action: 'update', userId: 'user-1', taskId: 'task-1', due: '2026-09-01',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── unknown action ────────────────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns error for unrecognised action', async () => {
      const result = await tool.execute({ action: 'reschedule', userId: 'user-1' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unknown action/i);
    });
  });
});

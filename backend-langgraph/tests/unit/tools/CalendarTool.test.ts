/**
 * Unit tests for CalendarTool — action routing and input validation.
 * The CalendarProvider is fully mocked so no external calls are made.
 */

import { CalendarTool } from '@/tools/CalendarTool';
import type { CalendarProvider } from '@/tools/providers/CalendarProvider';

// ── Mock provider ─────────────────────────────────────────────────────────────

const mockAdd = jest.fn();
const mockList = jest.fn();
const mockDelete = jest.fn();
const mockUpdate = jest.fn();

const mockProvider: CalendarProvider = {
  add: mockAdd,
  list: mockList,
  delete: mockDelete,
  update: mockUpdate,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CalendarTool', () => {
  let tool: CalendarTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new CalendarTool(mockProvider);
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('action: add', () => {
    it('delegates to provider.add with required fields', async () => {
      mockAdd.mockResolvedValue({ success: true, data: { eventId: 'evt-1' } });

      await tool.execute({
        action: 'add',
        userId: 'user-1',
        title: 'Tokyo trip',
        date: '2026-08-01',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', title: 'Tokyo trip', date: '2026-08-01' }),
      );
    });

    it('passes optional endDate, time, description to provider', async () => {
      mockAdd.mockResolvedValue({ success: true, data: {} });

      await tool.execute({
        action: 'add',
        userId: 'user-1',
        title: 'Multi-day trip',
        date: '2026-08-01',
        endDate: '2026-08-07',
        time: '09:00',
        description: 'Summer vacation',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: '2026-08-07', time: '09:00', description: 'Summer vacation' }),
      );
    });

    it('returns error when title is missing', async () => {
      const result = await tool.execute({ action: 'add', userId: 'user-1', date: '2026-08-01' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('returns error when date is missing', async () => {
      const result = await tool.execute({ action: 'add', userId: 'user-1', title: 'Trip' });
      expect(result.success).toBe(false);
    });

    it('returns error for non-ISO date format (MM/DD/YYYY)', async () => {
      const result = await tool.execute({
        action: 'add', userId: 'user-1', title: 'Trip', date: '08/01/2026',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid date/i);
    });

    it('returns error for invalid endDate format', async () => {
      const result = await tool.execute({
        action: 'add', userId: 'user-1', title: 'Trip', date: '2026-08-01', endDate: 'bad-date',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid endDate/i);
    });

    it('defaults category to "other" when an unrecognised value is given', async () => {
      mockAdd.mockResolvedValue({ success: true, data: {} });

      await tool.execute({
        action: 'add', userId: 'user-1', title: 'Trip', date: '2026-08-01', category: 'holiday',
      });

      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ category: 'other' }));
    });

    it.each(['travel', 'shopping', 'reminder', 'other'] as const)(
      'accepts valid category "%s"',
      async (category) => {
        mockAdd.mockResolvedValue({ success: true, data: {} });

        await tool.execute({
          action: 'add', userId: 'user-1', title: 'Trip', date: '2026-08-01', category,
        });

        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ category }));
      },
    );
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('action: list', () => {
    it('delegates to provider.list with userId', async () => {
      mockList.mockResolvedValue({ success: true, data: [] });

      await tool.execute({ action: 'list', userId: 'user-1' });

      expect(mockList).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('action: delete', () => {
    it('delegates to provider.delete with userId and eventId', async () => {
      mockDelete.mockResolvedValue({ success: true });

      await tool.execute({ action: 'delete', userId: 'user-1', eventId: 'evt-1' });

      expect(mockDelete).toHaveBeenCalledWith({ userId: 'user-1', eventId: 'evt-1' });
    });

    it('returns error when eventId is missing', async () => {
      const result = await tool.execute({ action: 'delete', userId: 'user-1' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/eventId.*required/i);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('action: update', () => {
    it('delegates to provider.update with eventId and changed fields', async () => {
      mockUpdate.mockResolvedValue({ success: true });

      await tool.execute({
        action: 'update', userId: 'user-1', eventId: 'evt-1', title: 'Updated trip',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', eventId: 'evt-1', title: 'Updated trip' }),
      );
    });

    it('returns error when eventId is missing', async () => {
      const result = await tool.execute({ action: 'update', userId: 'user-1', title: 'New title' });
      expect(result.success).toBe(false);
    });

    it('validates date format in update', async () => {
      const result = await tool.execute({
        action: 'update', userId: 'user-1', eventId: 'evt-1', date: 'not-a-date',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid date/i);
    });

    it('validates endDate format in update', async () => {
      const result = await tool.execute({
        action: 'update', userId: 'user-1', eventId: 'evt-1', date: '2026-08-01', endDate: 'also-bad',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── unknown action ────────────────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns error for unrecognised action', async () => {
      const result = await tool.execute({ action: 'fly', userId: 'user-1' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unknown action/i);
    });
  });
});

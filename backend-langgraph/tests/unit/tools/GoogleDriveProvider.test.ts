import { GoogleDriveProvider } from '@/tools/providers/GoogleDriveProvider';
import type { GoogleTokenRepository } from '@/repositories/GoogleTokenRepository';

// ── Mock googleapis ───────────────────────────────────────────────────────────
// jest.mock is hoisted above all variable declarations — the factory must be
// self-contained.  We capture references to the mock functions via the imported
// module AFTER the mock is established.

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        on: jest.fn(),
      })),
    },
    drive: jest.fn().mockReturnValue({
      files: {
        create: jest.fn(),
        list:   jest.fn(),
        get:    jest.fn(),
        export: jest.fn(),
      },
    }),
  },
}));

import { google } from 'googleapis';

// ── Mock GoogleTokenRepository ────────────────────────────────────────────────

const mockTokenGet          = jest.fn();
const mockTokenSave         = jest.fn();
const mockTokenSaveFolderId = jest.fn();

const mockTokenRepo = {
  get: mockTokenGet,
  save: mockTokenSave,
  saveDriveFolderId: mockTokenSaveFolderId,
} as unknown as GoogleTokenRepository;

// ── Drive mock handle ─────────────────────────────────────────────────────────

// drive() always returns the same mock object (mockReturnValue).
// Capture once in beforeAll; individual method mocks are cleared in beforeEach.
let driveMocks: {
  create: jest.Mock;
  list:   jest.Mock;
  get:    jest.Mock;
  export: jest.Mock;
};

beforeAll(() => {
  const driveInstance = (google.drive as jest.Mock)() as {
    files: { create: jest.Mock; list: jest.Mock; get: jest.Mock; export: jest.Mock };
  };
  driveMocks = driveInstance.files;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_TOKENS = {
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiryDate: Date.now() + 3_600_000,
  driveFolderId: null,
};

const FOLDER_ID = 'folder-abc';
const FILE_ID   = 'file-xyz';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('GoogleDriveProvider', () => {
  let provider: GoogleDriveProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GoogleDriveProvider(mockTokenRepo, 'client-id', 'client-secret', 'http://redirect');
  });

  // ── not connected ─────────────────────────────────────────────────────────

  describe('when Google is not connected', () => {
    it('returns error for list when tokens are absent', async () => {
      mockTokenGet.mockResolvedValue(null);

      const result = await provider.list({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not connected/i);
    });

    it('returns error for create when tokens are absent', async () => {
      mockTokenGet.mockResolvedValue(null);

      const result = await provider.create({ userId: 'user-1', name: 'f.txt', content: 'x' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not connected/i);
    });
  });

  // ── getOrCreateFolder ─────────────────────────────────────────────────────

  describe('folder management', () => {
    it('reuses driveFolderId from DB without calling Drive folder API', async () => {
      mockTokenGet.mockResolvedValue({ ...VALID_TOKENS, driveFolderId: FOLDER_ID });
      driveMocks.list.mockResolvedValue({ data: { files: [] } });

      await provider.list({ userId: 'user-1' });

      // Only one list call — for file listing, not folder search
      expect(driveMocks.create).not.toHaveBeenCalled();
      expect(driveMocks.list).toHaveBeenCalledTimes(1);
      expect(driveMocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining(FOLDER_ID) }),
      );
    });

    it('finds existing app folder in Drive and saves its ID', async () => {
      mockTokenGet.mockResolvedValue(VALID_TOKENS);
      // first list: folder search → existing folder found
      driveMocks.list
        .mockResolvedValueOnce({ data: { files: [{ id: FOLDER_ID }] } })
        // second list: file listing inside the folder
        .mockResolvedValueOnce({ data: { files: [] } });

      await provider.list({ userId: 'user-1' });

      expect(mockTokenSaveFolderId).toHaveBeenCalledWith('user-1', FOLDER_ID);
      expect(driveMocks.create).not.toHaveBeenCalled();
    });

    it('creates new folder when none exists and saves its ID', async () => {
      mockTokenGet.mockResolvedValue(VALID_TOKENS);
      driveMocks.list
        .mockResolvedValueOnce({ data: { files: [] } })    // folder search — nothing
        .mockResolvedValueOnce({ data: { files: [] } });   // file listing
      driveMocks.create.mockResolvedValue({ data: { id: FOLDER_ID } });

      await provider.list({ userId: 'user-1' });

      expect(driveMocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ mimeType: 'application/vnd.google-apps.folder' }),
        }),
      );
      expect(mockTokenSaveFolderId).toHaveBeenCalledWith('user-1', FOLDER_ID);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list()', () => {
    beforeEach(() => {
      mockTokenGet.mockResolvedValue({ ...VALID_TOKENS, driveFolderId: FOLDER_ID });
    });

    it('returns file list from app folder', async () => {
      driveMocks.list.mockResolvedValue({
        data: { files: [{ id: FILE_ID, name: 'Trip notes.txt', mimeType: 'text/plain', modifiedTime: '2026-01-01', size: '1024', webViewLink: 'https://drive.google.com/x' }] },
      });

      const result = await provider.list({ userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(result.data?.files).toHaveLength(1);
      expect(result.data?.files[0].name).toBe('Trip notes.txt');
    });

    it('returns empty list when folder is empty', async () => {
      driveMocks.list.mockResolvedValue({ data: { files: [] } });

      const result = await provider.list({ userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(0);
    });

    it('queries only within app folder', async () => {
      driveMocks.list.mockResolvedValue({ data: { files: [] } });

      await provider.list({ userId: 'user-1' });

      expect(driveMocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining(`'${FOLDER_ID}' in parents`) }),
      );
    });

    it('includes folder name in result', async () => {
      driveMocks.list.mockResolvedValue({ data: { files: [] } });

      const result = await provider.list({ userId: 'user-1' });

      expect(result.data?.folder).toBe('AI Travel Agent');
    });
  });

  // ── search ────────────────────────────────────────────────────────────────

  describe('search()', () => {
    beforeEach(() => {
      mockTokenGet.mockResolvedValue({ ...VALID_TOKENS, driveFolderId: FOLDER_ID });
    });

    it('searches by name within app folder', async () => {
      driveMocks.list.mockResolvedValue({ data: { files: [] } });

      await provider.search({ userId: 'user-1', query: 'Paris' });

      expect(driveMocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining("name contains 'Paris'") }),
      );
    });

    it('restricts search to app folder', async () => {
      driveMocks.list.mockResolvedValue({ data: { files: [] } });

      await provider.search({ userId: 'user-1', query: 'hotel' });

      expect(driveMocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining(`'${FOLDER_ID}' in parents`) }),
      );
    });

    it('returns matched files', async () => {
      driveMocks.list.mockResolvedValue({
        data: { files: [{ id: 'f1', name: 'Paris hotels.txt', mimeType: 'text/plain', modifiedTime: '2026-01-01', size: '500' }] },
      });

      const result = await provider.search({ userId: 'user-1', query: 'Paris' });

      expect(result.success).toBe(true);
      expect(result.data?.files[0].name).toBe('Paris hotels.txt');
    });
  });

  // ── read ──────────────────────────────────────────────────────────────────

  describe('read()', () => {
    beforeEach(() => {
      mockTokenGet.mockResolvedValue({ ...VALID_TOKENS, driveFolderId: FOLDER_ID });
    });

    it('reads plain text file via media download', async () => {
      driveMocks.get
        .mockResolvedValueOnce({ data: { name: 'notes.txt', mimeType: 'text/plain' } })
        .mockResolvedValueOnce({ data: 'Hello world' });

      const result = await provider.read({ userId: 'user-1', fileId: FILE_ID });

      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('Hello world');
    });

    it('exports Google Doc as text/plain', async () => {
      driveMocks.get.mockResolvedValueOnce({
        data: { name: 'My doc', mimeType: 'application/vnd.google-apps.document' },
      });
      driveMocks.export.mockResolvedValue({ data: 'Doc content here' });

      const result = await provider.read({ userId: 'user-1', fileId: FILE_ID });

      expect(result.success).toBe(true);
      expect(driveMocks.export).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'text/plain' }),
        expect.any(Object),
      );
      expect(result.data?.content).toBe('Doc content here');
    });

    it('exports Google Sheet as text/csv', async () => {
      driveMocks.get.mockResolvedValueOnce({
        data: { name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet' },
      });
      driveMocks.export.mockResolvedValue({ data: 'col1,col2\nval1,val2' });

      await provider.read({ userId: 'user-1', fileId: FILE_ID });

      expect(driveMocks.export).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'text/csv' }),
        expect.any(Object),
      );
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    beforeEach(() => {
      mockTokenGet.mockResolvedValue({ ...VALID_TOKENS, driveFolderId: FOLDER_ID });
    });

    it('creates file inside app folder', async () => {
      driveMocks.create.mockResolvedValue({ data: { id: FILE_ID, name: 'Itinerary.txt', webViewLink: 'https://drive.google.com/x' } });

      const result = await provider.create({ userId: 'user-1', name: 'Itinerary.txt', content: 'Day 1: Arrive Paris' });

      expect(result.success).toBe(true);
      expect(driveMocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ name: 'Itinerary.txt', parents: [FOLDER_ID] }),
        }),
      );
    });

    it('returns file link on success', async () => {
      driveMocks.create.mockResolvedValue({ data: { id: FILE_ID, name: 'notes.txt', webViewLink: 'https://drive.google.com/file/x' } });

      const result = await provider.create({ userId: 'user-1', name: 'notes.txt', content: 'content' });

      expect(result.success).toBe(true);
      expect(result.data?.file.webViewLink).toBe('https://drive.google.com/file/x');
    });

    it('defaults mimeType to text/plain', async () => {
      driveMocks.create.mockResolvedValue({ data: { id: FILE_ID, name: 'f.txt', webViewLink: '' } });

      await provider.create({ userId: 'user-1', name: 'f.txt', content: 'hello' });

      expect(driveMocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ mimeType: 'text/plain' }),
        }),
      );
    });

    it('uses provided mimeType', async () => {
      driveMocks.create.mockResolvedValue({ data: { id: FILE_ID, name: 'data.csv', webViewLink: '' } });

      await provider.create({ userId: 'user-1', name: 'data.csv', content: 'a,b', mimeType: 'text/csv' });

      expect(driveMocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ mimeType: 'text/csv' }),
        }),
      );
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    beforeEach(() => {
      mockTokenGet.mockResolvedValue({ ...VALID_TOKENS, driveFolderId: FOLDER_ID });
    });

    it('returns reconnect message on insufficientPermissions', async () => {
      driveMocks.list.mockRejectedValue(new Error('insufficientPermissions'));

      const result = await provider.list({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/reconnect/i);
    });

    it('returns reconnect message on invalid_grant', async () => {
      driveMocks.list.mockRejectedValue(new Error('invalid_grant'));

      const result = await provider.list({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/reconnect/i);
    });

    it('surfaces unknown errors as plain message', async () => {
      driveMocks.list.mockRejectedValue(new Error('Network timeout'));

      const result = await provider.list({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });
});

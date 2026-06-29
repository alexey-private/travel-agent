import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { DriveProvider } from './providers/DriveProvider';
import { MockDriveProvider } from './providers/MockDriveProvider';

interface DriveFilesInput {
  action: 'list' | 'search' | 'read';
  userId: string;
  query?: string;
  fileId?: string;
  folderId?: string;
  pageSize?: number;
}

export class DriveFilesTool extends BaseTool {
  readonly name = 'drive_files';
  readonly description =
    "Access files in the user's Google Drive. Actions: list (browse files in root or a folder), search (find files by name or content), read (get file text content). Supports Google Docs, Sheets, plain text, CSV, and JSON files.";

  readonly inputSchema: JSONSchema = {
    type: 'object',
    required: ['action', 'userId'],
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'search', 'read'],
        description: 'list: browse root/folder; search: find files by query; read: get text content of a file',
      },
      userId: { type: 'string', description: 'User session ID' },
      query: { type: 'string', description: 'Search query (required for search action)' },
      fileId: { type: 'string', description: 'File ID (required for read action)' },
      folderId: { type: 'string', description: 'Folder ID to list (optional, defaults to Drive root)' },
      pageSize: { type: 'number', description: 'Max results to return (default 20, max 50)' },
    },
  };

  private provider: DriveProvider;

  constructor(provider?: DriveProvider) {
    super();
    this.provider = provider ?? new MockDriveProvider();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const { action, userId, query, fileId, folderId, pageSize } = input as DriveFilesInput;

    switch (action) {
      case 'list':
        return this.provider.list({ userId, folderId, pageSize: Math.min(pageSize ?? 20, 50) });

      case 'search':
        if (!query) return { success: false, error: 'query is required for search action' };
        return this.provider.search({ userId, query, pageSize: Math.min(pageSize ?? 20, 50) });

      case 'read':
        if (!fileId) return { success: false, error: 'fileId is required for read action' };
        return this.provider.read({ userId, fileId });

      default:
        return { success: false, error: `Unknown action: ${action as string}. Use list, search, or read.` };
    }
  }
}

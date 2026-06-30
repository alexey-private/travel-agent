import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { DriveProvider } from './providers/DriveProvider';
import { MockDriveProvider } from './providers/MockDriveProvider';

interface DriveFilesInput {
  action: 'list' | 'search' | 'read' | 'create';
  userId: string;
  query?: string;
  fileId?: string;
  name?: string;
  content?: string;
  mimeType?: string;
  pageSize?: number;
}

export class DriveFilesTool extends BaseTool {
  readonly name = 'drive_files';
  readonly description =
    "Access the user's Google Drive folder (AI Travel Agent). Actions: list (show saved files), search (find by name), read (get file text content), create (save a new file — trip itinerary, notes, packing list, etc.). Only files created by this app are accessible.";

  readonly inputSchema: JSONSchema = {
    type: 'object',
    required: ['action', 'userId'],
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'search', 'read', 'create'],
        description: 'list: show files in app folder; search: find by name; read: get text content; create: save new file',
      },
      userId: { type: 'string', description: 'User session ID' },
      query: { type: 'string', description: 'Search query — file name to look for (required for search)' },
      fileId: { type: 'string', description: 'File ID (required for read)' },
      name: { type: 'string', description: 'File name with extension, e.g. "Paris trip.txt" (required for create)' },
      content: { type: 'string', description: 'Text content to save (required for create)' },
      mimeType: { type: 'string', description: 'MIME type for create, e.g. "text/plain" or "text/csv" (default: text/plain)' },
      pageSize: { type: 'number', description: 'Max results for list/search (default 20, max 50)' },
    },
  };

  private provider: DriveProvider;

  constructor(provider?: DriveProvider) {
    super();
    this.provider = provider ?? new MockDriveProvider();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const { action, userId, query, fileId, name, content, mimeType, pageSize } = input as DriveFilesInput;

    switch (action) {
      case 'list':
        return this.provider.list({ userId, pageSize: Math.min(pageSize ?? 20, 50) });

      case 'search':
        if (!query) return { success: false, error: 'query is required for search action' };
        return this.provider.search({ userId, query, pageSize: Math.min(pageSize ?? 20, 50) });

      case 'read':
        if (!fileId) return { success: false, error: 'fileId is required for read action' };
        return this.provider.read({ userId, fileId });

      case 'create':
        if (!name) return { success: false, error: 'name is required for create action' };
        if (!content) return { success: false, error: 'content is required for create action' };
        return this.provider.create({ userId, name, content, mimeType });

      default:
        return { success: false, error: `Unknown action: ${action as string}. Use list, search, read, or create.` };
    }
  }
}

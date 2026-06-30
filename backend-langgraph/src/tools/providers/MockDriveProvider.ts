import { ToolResult } from '../../types/tools';
import { DriveProvider, DriveListParams, DriveSearchParams, DriveReadParams, DriveCreateParams } from './DriveProvider';

interface MockFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number;
  content: string;
  webViewLink: string;
}

const store = new Map<string, MockFile[]>();
let idCounter = 100;

export class MockDriveProvider implements DriveProvider {
  constructor(private folderName = 'AI Travel Agent') {}

  private files(userId: string): MockFile[] {
    if (!store.has(userId)) store.set(userId, []);
    return store.get(userId)!;
  }

  async list(params: DriveListParams): Promise<ToolResult> {
    const files = this.files(params.userId).slice(0, params.pageSize ?? 20);
    return { success: true, data: { files, total: files.length, folder: this.folderName, source: 'mock' } };
  }

  async search(params: DriveSearchParams): Promise<ToolResult> {
    const q = params.query.toLowerCase();
    const files = this.files(params.userId).filter(f => f.name.toLowerCase().includes(q));
    return { success: true, data: { files, total: files.length, query: params.query, folder: this.folderName, source: 'mock' } };
  }

  async read(params: DriveReadParams): Promise<ToolResult> {
    const file = this.files(params.userId).find(f => f.id === params.fileId);
    if (!file) return { success: false, error: `File ${params.fileId} not found.` };
    return { success: true, data: { name: file.name, mimeType: file.mimeType, content: file.content, truncated: false, source: 'mock' } };
  }

  async create(params: DriveCreateParams): Promise<ToolResult> {
    const isBuffer = Buffer.isBuffer(params.content);
    const file: MockFile = {
      id: `drive_${(idCounter++).toString()}`,
      name: params.name,
      mimeType: params.mimeType ?? 'text/plain',
      modifiedTime: new Date().toISOString(),
      size: isBuffer ? (params.content as Buffer).byteLength : (params.content as string).length,
      content: isBuffer ? '<binary>' : (params.content as string),
      webViewLink: `https://drive.google.com/file/mock_${idCounter}`,
    };
    this.files(params.userId).push(file);
    return {
      success: true,
      data: {
        message: `File "${params.name}" saved to Google Drive in the "${this.folderName}" folder.`,
        file: { id: file.id, name: file.name, webViewLink: file.webViewLink },
        source: 'mock',
      },
    };
  }
}

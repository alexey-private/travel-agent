import { ToolResult } from '../../types/tools';
import { DriveProvider, DriveListParams, DriveSearchParams, DriveReadParams } from './DriveProvider';

const MOCK_FILES = [
  { id: 'file_001', name: 'Trip to Paris 2024.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedTime: '2024-11-15T10:00:00Z', size: 24576 },
  { id: 'file_002', name: 'Hotel bookings.pdf', mimeType: 'application/pdf', modifiedTime: '2024-11-10T08:30:00Z', size: 102400 },
  { id: 'file_003', name: 'Packing list.txt', mimeType: 'text/plain', modifiedTime: '2024-11-12T14:00:00Z', size: 1024 },
];

export class MockDriveProvider implements DriveProvider {
  async list(params: DriveListParams): Promise<ToolResult> {
    const limit = params.pageSize ?? 10;
    return {
      success: true,
      data: { files: MOCK_FILES.slice(0, limit), total: MOCK_FILES.length, source: 'mock' },
    };
  }

  async search(params: DriveSearchParams): Promise<ToolResult> {
    const q = params.query.toLowerCase();
    const matches = MOCK_FILES.filter(f => f.name.toLowerCase().includes(q));
    return {
      success: true,
      data: { files: matches, total: matches.length, query: params.query, source: 'mock' },
    };
  }

  async read(_params: DriveReadParams): Promise<ToolResult> {
    return {
      success: true,
      data: { content: '[Mock Drive file content]', mimeType: 'text/plain', source: 'mock' },
    };
  }
}

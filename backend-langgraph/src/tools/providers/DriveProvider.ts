import { ToolResult } from '../../types/tools';

export interface DriveListParams {
  userId: string;
  folderId?: string;
  pageSize?: number;
}

export interface DriveSearchParams {
  userId: string;
  query: string;
  pageSize?: number;
}

export interface DriveReadParams {
  userId: string;
  fileId: string;
}

export interface DriveProvider {
  list(params: DriveListParams): Promise<ToolResult>;
  search(params: DriveSearchParams): Promise<ToolResult>;
  read(params: DriveReadParams): Promise<ToolResult>;
}

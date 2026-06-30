import { ToolResult } from '../../types/tools';

export interface DriveListParams {
  userId: string;
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

export interface DriveCreateParams {
  userId: string;
  name: string;
  content: string | Buffer;
  mimeType?: string;
}

export interface DriveProvider {
  list(params: DriveListParams): Promise<ToolResult>;
  search(params: DriveSearchParams): Promise<ToolResult>;
  read(params: DriveReadParams): Promise<ToolResult>;
  create(params: DriveCreateParams): Promise<ToolResult>;
}

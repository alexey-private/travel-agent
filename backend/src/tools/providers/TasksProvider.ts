import { ToolResult } from '../../types/tools';

export interface TasksAddParams {
  userId: string;
  title: string;
  notes?: string;
  due?: string;        // YYYY-MM-DD
  tasklistName?: string;
}

export interface TasksListParams {
  userId: string;
  tasklistName?: string;
  includeCompleted?: boolean;
}

export interface TasksCompleteParams {
  userId: string;
  taskId: string;
  tasklistName?: string;
}

export interface TasksDeleteParams {
  userId: string;
  taskId: string;
  tasklistName?: string;
}

export interface TasksProvider {
  add(params: TasksAddParams): Promise<ToolResult>;
  list(params: TasksListParams): Promise<ToolResult>;
  complete(params: TasksCompleteParams): Promise<ToolResult>;
  delete(params: TasksDeleteParams): Promise<ToolResult>;
}

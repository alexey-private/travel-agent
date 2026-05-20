import { ToolResult } from '../../types/tools';

export interface CalendarAddParams {
  userId: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  category: string;
}

export interface CalendarListParams {
  userId: string;
}

export interface CalendarDeleteParams {
  userId: string;
  eventId: string;
}

export interface CalendarProvider {
  add(params: CalendarAddParams): Promise<ToolResult>;
  list(params: CalendarListParams): Promise<ToolResult>;
  delete(params: CalendarDeleteParams): Promise<ToolResult>;
}

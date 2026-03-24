export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JSONSchema;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

import { ToolResult, JSONSchema } from '../types/tools';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchema;

  abstract execute(input: unknown): Promise<ToolResult>;

  toToolDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

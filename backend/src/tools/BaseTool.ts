import { ToolResult, JSONSchema } from '../types/tools';
import { LLMToolDefinition } from '../llm/types';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchema;

  abstract execute(input: unknown): Promise<ToolResult>;

  toToolDefinition(): LLMToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

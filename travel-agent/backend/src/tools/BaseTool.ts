import Anthropic from '@anthropic-ai/sdk';
import { ToolResult, JSONSchema } from '../types/tools';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchema;

  abstract execute(input: unknown): Promise<ToolResult>;

  toAnthropicTool(): Anthropic.Tool {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.inputSchema as Anthropic.Tool['input_schema'],
    };
  }
}

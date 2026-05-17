import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { wrapTool } from '@/tools/wrapTool';
import { BaseTool } from '@/tools/BaseTool';
import { ToolResult } from '@/types/tools';

jest.mock('@/config/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key',
    TAVILY_API_KEY: 'test-tavily',
    OPENWEATHER_API_KEY: 'test-weather',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

class EchoTool extends BaseTool {
  name = 'echo';
  description = 'Echoes the input back';
  inputSchema = {
    type: 'object' as const,
    properties: {
      message: { type: 'string' as const, description: 'The message to echo' },
      count: { type: 'integer' as const, description: 'How many times' },
    },
    required: ['message'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    return { success: true, data: { echoed: input.message } };
  }
}

class FailingTool extends BaseTool {
  name = 'failing_tool';
  description = 'Always fails';
  inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const },
    },
    required: ['query'],
  };

  async execute(): Promise<ToolResult> {
    return { success: false, error: 'Something went wrong' };
  }
}

class DataObjectTool extends BaseTool {
  name = 'data_tool';
  description = 'Returns object data';
  inputSchema = {
    type: 'object' as const,
    properties: {
      id: { type: 'number' as const },
      active: { type: 'boolean' as const },
      tags: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
    },
    required: ['id'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    return { success: true, data: { id: input.id, result: 'ok' } };
  }
}

describe('wrapTool', () => {
  it('returns a DynamicStructuredTool', () => {
    const wrapped = wrapTool(new EchoTool());
    expect(wrapped).toBeInstanceOf(DynamicStructuredTool);
  });

  it('preserves the name and description', () => {
    const wrapped = wrapTool(new EchoTool());
    expect(wrapped.name).toBe('echo');
    expect(wrapped.description).toBe('Echoes the input back');
  });

  it('builds a Zod schema with required and optional fields', () => {
    const wrapped = wrapTool(new EchoTool());
    expect(wrapped.schema).toBeInstanceOf(z.ZodObject);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (wrapped.schema as any).shape as Record<string, z.ZodTypeAny>;

    // required field — not wrapped in ZodOptional
    expect(shape.message).toBeInstanceOf(z.ZodString);
    // optional field — wrapped in ZodOptional
    expect(shape.count).toBeInstanceOf(z.ZodOptional);
  });

  it('invokes the BaseTool and returns JSON string on success', async () => {
    const wrapped = wrapTool(new EchoTool());
    const result = await wrapped.invoke({ message: 'hello' });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result as string);
    expect(parsed).toEqual({ echoed: 'hello' });
  });

  it('throws when BaseTool.execute returns success: false', async () => {
    const wrapped = wrapTool(new FailingTool());
    await expect(wrapped.invoke({ query: 'anything' })).rejects.toThrow('Something went wrong');
  });

  it('handles nested object schema with boolean and array fields', () => {
    const wrapped = wrapTool(new DataObjectTool());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (wrapped.schema as any).shape as Record<string, z.ZodTypeAny>;

    expect(shape.id).toBeInstanceOf(z.ZodNumber);
    expect(shape.active).toBeInstanceOf(z.ZodOptional);
    expect(shape.tags).toBeInstanceOf(z.ZodOptional);
  });

  it('returns the raw string when execute returns a string data value', async () => {
    class StringTool extends BaseTool {
      name = 'string_tool';
      description = 'Returns string';
      inputSchema = {
        type: 'object' as const,
        properties: { q: { type: 'string' as const } },
        required: ['q'],
      };
      async execute(): Promise<ToolResult> {
        return { success: true, data: 'plain text result' };
      }
    }

    const wrapped = wrapTool(new StringTool());
    const result = await wrapped.invoke({ q: 'test' });
    expect(result).toBe('plain text result');
  });

  it('uses generic error message when BaseTool provides no error string', async () => {
    class NoErrorTool extends BaseTool {
      name = 'no_err';
      description = 'Fails silently';
      inputSchema = {
        type: 'object' as const,
        properties: { x: { type: 'string' as const } },
        required: ['x'],
      };
      async execute(): Promise<ToolResult> {
        return { success: false };
      }
    }

    const wrapped = wrapTool(new NoErrorTool());
    await expect(wrapped.invoke({ x: 'y' })).rejects.toThrow('Tool execution failed');
  });
});

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from './BaseTool';
import { JSONSchema } from '../types/tools';

/**
 * Converts a JSONSchema object (as used in BaseTool.inputSchema) into a Zod schema.
 * Supports: string, number, boolean, integer, object with nested properties, array.
 *
 * LangGraph's ToolNode requires tools with a Zod schema — this bridge lets us
 * reuse all existing BaseTool implementations without modification.
 */
function jsonSchemaToZod(schema: JSONSchema): z.ZodTypeAny {
  const { type, properties, required = [], items } = schema;

  if (type === 'object' && properties) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      let field = jsonSchemaToZod(propSchema);
      if (!required.includes(key)) field = field.optional();
      if (propSchema.description) field = field.describe(propSchema.description);
      shape[key] = field;
    }
    return z.object(shape);
  }

  if (type === 'string') return z.string();
  if (type === 'number' || type === 'integer') return z.number();
  if (type === 'boolean') return z.boolean();
  if (type === 'array') return z.array(items ? jsonSchemaToZod(items) : z.unknown());

  return z.unknown();
}

/**
 * Wraps an existing BaseTool into a LangChain DynamicStructuredTool so it
 * can be used with LangGraph's ToolNode and model.bindTools().
 *
 * The wrapped tool:
 * - Preserves the original name, description, and parameter schema
 * - On success: returns JSON string of tool data
 * - On failure: throws an Error so the LLM can observe and self-correct
 */
export function wrapTool(baseTool: BaseTool): DynamicStructuredTool {
  const zodResult = jsonSchemaToZod(baseTool.inputSchema);

  // DynamicStructuredTool requires a ZodObject at the top level
  const schema = zodResult instanceof z.ZodObject
    ? zodResult
    : z.object({ value: zodResult });

  return new DynamicStructuredTool({
    name: baseTool.name,
    description: baseTool.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: schema as any,
    func: async (input: Record<string, unknown>) => {
      const result = await baseTool.execute(input);
      if (!result.success) {
        // Return the error as a tool result string so the model sees it and
        // can explain the problem or ask the user for the missing information.
        return `ERROR: ${result.error ?? 'Tool execution failed'}`;
      }
      return typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data);
    },
  });
}

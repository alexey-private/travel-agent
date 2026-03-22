import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { env } from '../config/env';

interface WebSearchInput {
  query: string;
  max_results?: number;
}

export class WebSearchTool extends BaseTool {
  readonly name = 'web_search';
  readonly description = 'Search the web for current information about travel destinations, visa requirements, flights, hotels, and local tips.';
  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
        minimum: 1,
        maximum: 10,
        default: 5,
      },
    },
    required: ['query'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { query, max_results = 5 } = input as WebSearchInput;

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: env.TAVILY_API_KEY,
          query,
          max_results,
          search_depth: 'basic',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Tavily API error ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return {
        success: true,
        data: {
          results: (data.results || []).map((r: { title: string; url: string; content: string }) => ({
            title: r.title,
            url: r.url,
            content: r.content,
          })),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

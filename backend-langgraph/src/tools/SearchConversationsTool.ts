import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { ConversationService } from '../services/ConversationService';

interface SearchConversationsInput {
  query: string;
  userId: string;
  agentType?: 'travel' | 'shopping';
  limit?: number;
}

export class SearchConversationsTool extends BaseTool {
  readonly name = 'search_conversations';
  readonly description =
    'Search through the user\'s past conversation history to find relevant information. ' +
    'Use this when the user refers to something discussed before, asks "remember when we talked about X", ' +
    '"what countries did we discuss", "check our previous conversations", or any similar recall request. ' +
    'Returns matching message excerpts with dates.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords or phrase to search for in past conversations. Include specific place names, cities, countries (e.g. "London Paris hotel", "Morocco tour", "Barcelona flights visa"). The more specific the query, the better the results.',
      },
      userId: {
        type: 'string',
        description: 'User identifier',
      },
      agentType: {
        type: 'string',
        description: 'Which agent\'s conversations to search: "travel" or "shopping" (default: "travel")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10, max: 20)',
      },
    },
    required: ['query', 'userId'],
  };

  constructor(private conversationService: ConversationService) {
    super();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const { query, userId, agentType = 'travel', limit = 5 } = input as SearchConversationsInput;

    if (!query?.trim()) {
      return { success: false, error: 'query is required' };
    }

    const clampedLimit = Math.min(Math.max(1, limit), 20);

    const results = await this.conversationService.searchConversations(userId, query.trim(), agentType, clampedLimit);

    if (!results.length) {
      return {
        success: true,
        data: { results: [], message: `No past conversations found matching "${query}".` },
      };
    }

    return {
      success: true,
      data: {
        results: results.map(r => ({
          date: r.date,
          role: r.role,
          excerpt: r.excerpt,
        })),
        total: results.length,
      },
    };
  }
}

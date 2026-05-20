import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { MockSpaProvider } from './providers/MockSpaProvider';
import { SpaSearchParams } from './providers/SpaProvider';

interface SpaSearchInput {
  city: string;
  treatmentType?: 'massage' | 'facial' | 'body' | 'wellness' | 'thermal' | 'ayurveda';
  maxPrice?: number;
  maxResults?: number;
}

export class SpaSearchTool extends BaseTool {
  readonly name = 'search_spas';
  readonly description =
    'Search for spas and wellness centers in a city. Returns options with treatments, pricing, amenities, and ratings. ' +
    'Use when the user asks about spas, wellness centers, massages, beauty treatments, relaxation, or self-care experiences at a destination.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City to search spas in (e.g. "Bali", "Paris", "Bangkok")',
      },
      treatmentType: {
        type: 'string',
        enum: ['massage', 'facial', 'body', 'wellness', 'thermal', 'ayurveda'],
        description: 'Type of treatment or spa focus. Omit to see all types.',
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price per treatment in USD',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of spas to return (default: 4, max: 6)',
        minimum: 1,
        maximum: 6,
      },
    },
    required: ['city'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { city, treatmentType, maxPrice, maxResults = 4 } = input as SpaSearchInput;

    const params: SpaSearchParams = {
      city, treatmentType, maxPrice,
      maxResults: Math.min(maxResults, 6),
    };

    return new MockSpaProvider().search(params);
  }
}

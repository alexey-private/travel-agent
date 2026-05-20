import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { MockTourProvider } from './providers/MockTourProvider';
import { TourSearchParams } from './providers/TourProvider';

interface TourSearchInput {
  destination: string;
  tourType?: 'cultural' | 'adventure' | 'food' | 'nature' | 'historical' | 'cruise' | 'family';
  durationDays?: number;
  maxPrice?: number;
  maxResults?: number;
}

export class TourSearchTool extends BaseTool {
  readonly name = 'search_tours';
  readonly description =
    'Search for guided tours and tour packages in a destination. Returns tours with itinerary highlights, pricing, duration, operator details, and group size. ' +
    'Use when the user asks about guided tours, tour packages, group travel, or organized trips.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: 'Destination city or country for the tour (e.g. "Peru", "Kyoto", "Morocco")',
      },
      tourType: {
        type: 'string',
        enum: ['cultural', 'adventure', 'food', 'nature', 'historical', 'cruise', 'family'],
        description: 'Type of tour. Omit to see all types.',
      },
      durationDays: {
        type: 'number',
        description: 'Preferred tour duration in days (e.g. 7 for a week-long tour)',
        minimum: 1,
        maximum: 30,
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price per person in USD',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of tours to return (default: 4, max: 6)',
        minimum: 1,
        maximum: 6,
      },
    },
    required: ['destination'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { destination, tourType, durationDays, maxPrice, maxResults = 4 } = input as TourSearchInput;

    const params: TourSearchParams = {
      destination, tourType, durationDays, maxPrice,
      maxResults: Math.min(maxResults, 6),
    };

    return new MockTourProvider().search(params);
  }
}

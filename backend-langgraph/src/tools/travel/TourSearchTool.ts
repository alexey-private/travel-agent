import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { MockTourProvider } from './providers/MockTourProvider';
import { TourSearchParams } from './providers/TourProvider';

type TourType = 'cultural' | 'adventure' | 'food' | 'nature' | 'historical' | 'cruise' | 'family';
const VALID_TOUR_TYPES: TourType[] = ['cultural', 'adventure', 'food', 'nature', 'historical', 'cruise', 'family'];

interface TourSearchInput {
  destination: string;
  tourType?: string;
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
        description: 'Type of tour (case-insensitive): cultural, adventure, food, nature, historical, cruise, family. Omit to see all types.',
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
    const raw = input as TourSearchInput;
    const { destination, durationDays, maxPrice, maxResults = 4 } = raw;

    const normalizedType = raw.tourType?.toLowerCase() as TourType | undefined;
    const tourType = normalizedType && VALID_TOUR_TYPES.includes(normalizedType) ? normalizedType : undefined;

    const params: TourSearchParams = {
      destination, tourType, durationDays, maxPrice,
      maxResults: Math.min(maxResults, 6),
    };

    return new MockTourProvider().search(params);
  }
}

import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { env } from '../../config/env';
import { LiteApiHotelProvider } from './providers/LiteApiHotelProvider';
import { MockHotelProvider } from './providers/MockHotelProvider';
import { HotelSearchParams } from './providers/HotelProvider';

interface HotelSearchInput {
  city: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  maxResults?: number;
  maxPrice?: number;
  stars?: number;
}

export class HotelSearchTool extends BaseTool {
  readonly name = 'search_hotels';
  readonly description =
    'Search for available hotels in a city for specific dates. Returns hotel options with prices, star ratings, amenities, and cancellation policies. ' +
    'Use when the user asks about accommodation, hotels, places to stay, or where to sleep during a trip.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name to search hotels in (e.g. "Paris", "Tokyo", "New York")',
      },
      checkIn: {
        type: 'string',
        description: 'Check-in date in YYYY-MM-DD format',
      },
      checkOut: {
        type: 'string',
        description: 'Check-out date in YYYY-MM-DD format',
      },
      guests: {
        type: 'number',
        description: 'Number of guests (default: 2)',
        minimum: 1,
        maximum: 10,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of hotels to return (default: 4, max: 6)',
        minimum: 1,
        maximum: 6,
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price per night in USD',
      },
      stars: {
        type: 'number',
        description: 'Minimum star rating filter (3, 4, or 5)',
        enum: [3, 4, 5],
      },
    },
    required: ['city', 'checkIn', 'checkOut'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { city, checkIn, checkOut, guests = 2, maxResults = 4, maxPrice, stars } = input as HotelSearchInput;

    const params: HotelSearchParams = {
      city, checkIn, checkOut,
      guests,
      maxResults: Math.min(maxResults, 6),
      maxPrice,
      stars,
    };

    if (env.LITEAPI_KEY) {
      try {
        return await new LiteApiHotelProvider(env.LITEAPI_KEY).search(params);
      } catch (err) {
        console.error('[HotelSearchTool] LiteAPI error, falling back to mock:', err);
      }
    }

    return new MockHotelProvider().search(params);
  }
}

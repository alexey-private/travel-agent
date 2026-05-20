import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { MockCarRentalProvider } from './providers/MockCarRentalProvider';
import { CarRentalSearchParams } from './providers/CarRentalProvider';

interface CarRentalInput {
  city: string;
  pickupDate: string;
  returnDate: string;
  carClass?: 'economy' | 'compact' | 'midsize' | 'suv' | 'luxury' | 'van';
  maxResults?: number;
}

export class CarRentalTool extends BaseTool {
  readonly name = 'search_car_rentals';
  readonly description =
    'Search for available car rentals in a city for specific dates. Returns rental offers with car models, prices, included features, and pickup locations. ' +
    'Use when the user asks about renting a car, car hire, or transportation at a destination.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City where the car will be picked up (e.g. "Rome", "Los Angeles")',
      },
      pickupDate: {
        type: 'string',
        description: 'Pickup date in YYYY-MM-DD format',
      },
      returnDate: {
        type: 'string',
        description: 'Return date in YYYY-MM-DD format',
      },
      carClass: {
        type: 'string',
        enum: ['economy', 'compact', 'midsize', 'suv', 'luxury', 'van'],
        description: 'Car class preference. Omit to see all classes.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of offers to return (default: 4, max: 6)',
        minimum: 1,
        maximum: 6,
      },
    },
    required: ['city', 'pickupDate', 'returnDate'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { city, pickupDate, returnDate, carClass, maxResults = 4 } = input as CarRentalInput;

    const params: CarRentalSearchParams = {
      city, pickupDate, returnDate,
      carClass,
      maxResults: Math.min(maxResults, 6),
    };

    return new MockCarRentalProvider().search(params);
  }
}

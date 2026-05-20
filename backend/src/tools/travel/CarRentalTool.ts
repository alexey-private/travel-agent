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
    'Use when the user asks about renting a car, car hire, or transportation at a destination. ' +
    'IMPORTANT: pickupDate and returnDate MUST be in YYYY-MM-DD format. If the user gave only a month or vague dates, infer specific dates (e.g. "August" → pickupDate: "2026-08-01", returnDate: "2026-08-08" for a week). Do NOT ask the user to clarify dates — always infer reasonable defaults.';

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
        description: 'Car class preference: economy, compact, midsize, suv, SUV, luxury, van. Case-insensitive. Omit to see all classes.',
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
    const raw = input as CarRentalInput & { carClass?: string };
    const { city, pickupDate, returnDate, maxResults = 4 } = raw;
    const carClass = raw.carClass?.toLowerCase() as CarRentalInput['carClass'] | undefined;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(pickupDate) || isNaN(Date.parse(pickupDate))) {
      return { success: false, error: `Invalid pickupDate "${pickupDate}". Use YYYY-MM-DD format (e.g. "2026-08-01").` };
    }
    if (!dateRe.test(returnDate) || isNaN(Date.parse(returnDate))) {
      return { success: false, error: `Invalid returnDate "${returnDate}". Use YYYY-MM-DD format (e.g. "2026-08-08").` };
    }
    if (returnDate <= pickupDate) {
      return { success: false, error: `returnDate "${returnDate}" must be after pickupDate "${pickupDate}".` };
    }

    const params: CarRentalSearchParams = {
      city, pickupDate, returnDate,
      carClass,
      maxResults: Math.min(maxResults, 6),
    };

    return new MockCarRentalProvider().search(params);
  }
}

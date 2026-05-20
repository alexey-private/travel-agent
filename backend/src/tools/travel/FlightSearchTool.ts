import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { env } from '../../config/env';
import { DuffelFlightProvider } from './providers/DuffelFlightProvider';
import { MockFlightProvider } from './providers/MockFlightProvider';
import { FlightSearchParams } from './providers/FlightProvider';

interface FlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
  maxResults?: number;
}

export class FlightSearchTool extends BaseTool {
  readonly name = 'search_flights';
  readonly description =
    'Search for available flights between two cities. Provide city names (e.g. "Tokyo", "San Francisco") or IATA codes (e.g. "NRT", "SFO"), a departure date, and number of passengers.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      origin: {
        type: 'string',
        description: 'Departure city name or IATA airport code (e.g. "San Francisco" or "SFO")',
      },
      destination: {
        type: 'string',
        description: 'Arrival city name or IATA airport code (e.g. "Tokyo" or "NRT")',
      },
      departureDate: {
        type: 'string',
        description: 'Departure date in YYYY-MM-DD format',
      },
      adults: {
        type: 'number',
        description: 'Number of adult passengers (default: 1)',
        minimum: 1,
        maximum: 9,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of flight offers to return (default: 3)',
        minimum: 1,
        maximum: 5,
      },
    },
    required: ['origin', 'destination', 'departureDate'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { origin, destination, departureDate, adults = 1, maxResults = 3 } = input as FlightSearchInput;

    const params: FlightSearchParams = {
      origin, destination, departureDate,
      adults,
      maxResults: Math.min(maxResults, 5),
    };

    if (env.DUFFEL_API_KEY) {
      try {
        return await new DuffelFlightProvider(env.DUFFEL_API_KEY).search(params);
      } catch (err) {
        console.error('[FlightSearchTool] Duffel error, falling back to mock:', err);
      }
    }

    return new MockFlightProvider().search(params);
  }
}

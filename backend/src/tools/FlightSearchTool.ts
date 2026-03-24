import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';

interface FlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
  maxResults?: number;
}

interface FlightOffer {
  airline: string;
  flightNumber: string;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  duration: string;
  price: { amount: string; currency: string };
  stops: number;
}

/** Common city → IATA mapping for realistic mock data. */
const CITY_TO_IATA: Record<string, string> = {
  'san francisco': 'SFO', 'new york': 'JFK', 'los angeles': 'LAX',
  'london': 'LHR', 'paris': 'CDG', 'amsterdam': 'AMS', 'frankfurt': 'FRA',
  'berlin': 'BER', 'madrid': 'MAD', 'rome': 'FCO', 'barcelona': 'BCN',
  'tokyo': 'NRT', 'osaka': 'KIX', 'seoul': 'ICN', 'beijing': 'PEK',
  'shanghai': 'PVG', 'hong kong': 'HKG', 'singapore': 'SIN',
  'bangkok': 'BKK', 'bali': 'DPS', 'dubai': 'DXB', 'sydney': 'SYD',
  'melbourne': 'MEL', 'toronto': 'YYZ', 'chicago': 'ORD', 'miami': 'MIA',
  'boston': 'BOS', 'seattle': 'SEA', 'denver': 'DEN', 'mexico city': 'MEX',
  'buenos aires': 'EZE', 'sao paulo': 'GRU', 'cairo': 'CAI', 'istanbul': 'IST',
};

const AIRLINES = [
  { code: 'UA', name: 'United Airlines' },
  { code: 'AA', name: 'American Airlines' },
  { code: 'DL', name: 'Delta Air Lines' },
  { code: 'BA', name: 'British Airways' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'AF', name: 'Air France' },
  { code: 'NH', name: 'ANA' },
  { code: 'JL', name: 'Japan Airlines' },
  { code: 'SQ', name: 'Singapore Airlines' },
  { code: 'EK', name: 'Emirates' },
];

/**
 * Deterministic seeded pseudo-random (no external dependency).
 * Returns a float in [0, 1) based on a string seed.
 */
function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

/**
 * Generates realistic-looking flight data for demonstration purposes.
 * Results are deterministic for the same input (no random variation on refresh).
 */
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

  private resolveIata(input: string): string {
    const trimmed = input.trim();
    if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
    return CITY_TO_IATA[trimmed.toLowerCase()] ?? trimmed.slice(0, 3).toUpperCase();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const { origin, destination, departureDate, adults = 1, maxResults = 3 } = input as FlightSearchInput;

    const originCode = this.resolveIata(origin);
    const destCode = this.resolveIata(destination);
    const seed = `${originCode}${destCode}${departureDate}`;

    const count = Math.min(maxResults, 3);
    const flights: FlightOffer[] = [];

    for (let i = 0; i < count; i++) {
      const airlineIdx = Math.floor(seededRand(seed, i * 7) * AIRLINES.length);
      const airline = AIRLINES[airlineIdx];

      const basePrice = 400 + Math.floor(seededRand(seed, i * 13 + 1) * 1200);
      const price = basePrice * adults;

      const depHour = 6 + Math.floor(seededRand(seed, i * 11 + 2) * 14);
      const depMin = [0, 15, 30, 45][Math.floor(seededRand(seed, i * 9 + 3) * 4)];
      const durationH = 8 + Math.floor(seededRand(seed, i * 5 + 4) * 8);
      const durationM = [0, 15, 30, 45][Math.floor(seededRand(seed, i * 3 + 5) * 4)];
      const stops = seededRand(seed, i * 17 + 6) > 0.6 ? 0 : 1;

      const depTime = `${departureDate}T${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}:00`;
      const arrDate = new Date(`${departureDate}T${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}:00`);
      arrDate.setHours(arrDate.getHours() + durationH);
      arrDate.setMinutes(arrDate.getMinutes() + durationM);

      const flightNum = 100 + Math.floor(seededRand(seed, i * 19 + 7) * 900);

      flights.push({
        airline: airline.name,
        flightNumber: `${airline.code}${flightNum}`,
        departure: { airport: originCode, time: depTime },
        arrival: {
          airport: destCode,
          time: arrDate.toISOString().replace('.000Z', ''),
        },
        duration: `${durationH}h ${durationM > 0 ? `${durationM}m` : ''}`.trim(),
        price: { amount: String(price), currency: 'USD' },
        stops,
      });
    }

    // Sort by price
    flights.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));

    return {
      success: true,
      data: {
        flights,
        originCode,
        destCode,
        note: 'Sample data for demonstration purposes. Prices and schedules are illustrative.',
      },
    };
  }
}

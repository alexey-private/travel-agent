import { ToolResult } from '../../../types/tools';
import { FlightProvider, FlightSearchParams, FlightOffer } from './FlightProvider';
import { resolveIata } from './DuffelFlightProvider';

const AIRLINES = [
  { code: 'UA', name: 'United Airlines' }, { code: 'AA', name: 'American Airlines' },
  { code: 'DL', name: 'Delta Air Lines' }, { code: 'BA', name: 'British Airways' },
  { code: 'LH', name: 'Lufthansa' }, { code: 'AF', name: 'Air France' },
  { code: 'NH', name: 'ANA' }, { code: 'JL', name: 'Japan Airlines' },
  { code: 'SQ', name: 'Singapore Airlines' }, { code: 'EK', name: 'Emirates' },
  { code: 'LY', name: 'El Al' },
];

function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

export class MockFlightProvider implements FlightProvider {
  async search(params: FlightSearchParams): Promise<ToolResult> {
    const originCode = resolveIata(params.origin);
    const destCode = resolveIata(params.destination);
    const count = Math.min(params.maxResults, 3);
    const seed = `${originCode}${destCode}${params.departureDate}`;

    const flights: FlightOffer[] = [];
    for (let i = 0; i < count; i++) {
      const airline = AIRLINES[Math.floor(seededRand(seed, i * 7) * AIRLINES.length)];
      const basePrice = 400 + Math.floor(seededRand(seed, i * 13 + 1) * 1200);
      const price = basePrice * params.adults;
      const depHour = 6 + Math.floor(seededRand(seed, i * 11 + 2) * 14);
      const depMin = [0, 15, 30, 45][Math.floor(seededRand(seed, i * 9 + 3) * 4)];
      const durationH = 8 + Math.floor(seededRand(seed, i * 5 + 4) * 8);
      const durationM = [0, 15, 30, 45][Math.floor(seededRand(seed, i * 3 + 5) * 4)];
      const stops = seededRand(seed, i * 17 + 6) > 0.6 ? 0 : 1;
      const depTime = `${params.departureDate}T${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}:00`;
      const arrDate = new Date(depTime);
      arrDate.setHours(arrDate.getHours() + durationH);
      arrDate.setMinutes(arrDate.getMinutes() + durationM);
      const flightNum = 100 + Math.floor(seededRand(seed, i * 19 + 7) * 900);

      flights.push({
        airline: airline.name,
        flightNumber: `${airline.code}${flightNum}`,
        departure: { airport: originCode, time: depTime },
        arrival: { airport: destCode, time: arrDate.toISOString().replace('.000Z', '') },
        duration: `${durationH}h${durationM > 0 ? ` ${durationM}m` : ''}`,
        price: { amount: String(price), currency: 'USD' },
        stops,
      });
    }

    flights.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));

    return {
      success: true,
      data: {
        flights,
        originCode,
        destCode,
        note: 'Sample data for demonstration purposes.',
        source: 'mock',
      },
    };
  }
}

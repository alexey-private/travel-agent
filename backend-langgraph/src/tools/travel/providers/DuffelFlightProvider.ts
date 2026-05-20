import { ToolResult } from '../../../types/tools';
import { FlightProvider, FlightSearchParams, FlightOffer } from './FlightProvider';

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
  'tel aviv': 'TLV', 'jerusalem': 'TLV',
};

export function resolveIata(input: string): string {
  const trimmed = input.trim();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  return CITY_TO_IATA[trimmed.toLowerCase()] ?? trimmed.slice(0, 3).toUpperCase();
}

function parseDuration(iso: string): string {
  const match = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const totalH = (parseInt(match[1] ?? '0') * 24) + parseInt(match[2] ?? '0');
  const m = match[3] ? `${match[3]}m` : '';
  const h = totalH > 0 ? `${totalH}h` : '';
  return [h, m].filter(Boolean).join(' ');
}

async function duffelPost(apiKey: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.duffel.com${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Duffel-Version': 'v2',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data: body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Duffel API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as { data: unknown };
  return json.data;
}

export class DuffelFlightProvider implements FlightProvider {
  constructor(private readonly apiKey: string) {}

  async search(params: FlightSearchParams): Promise<ToolResult> {
    const originCode = resolveIata(params.origin);
    const destCode = resolveIata(params.destination);

    const passengers = Array.from({ length: params.adults }, () => ({ type: 'adult' }));

    const data = await duffelPost(this.apiKey, '/air/offer_requests?return_offers=true', {
      slices: [{
        origin: originCode,
        destination: destCode,
        departure_date: params.departureDate,
        departure_time: { from: '00:00', to: '23:59' },
        arrival_time: { from: '00:00', to: '23:59' },
      }],
      passengers,
      cabin_class: 'economy',
    }) as { offers?: unknown[] };

    const offers = (data.offers ?? []).slice(0, params.maxResults) as Record<string, unknown>[];

    if (offers.length === 0) {
      return {
        success: true,
        data: { flights: [], originCode, destCode, message: 'No flights found.', source: 'duffel' },
      };
    }

    const flights: FlightOffer[] = offers.map(offer => {
      const slices = offer.slices as Record<string, unknown>[];
      const slice = slices[0];
      const segments = slice.segments as Record<string, unknown>[];
      const seg = segments[0];
      const lastSeg = segments[segments.length - 1];
      const owner = offer.owner as Record<string, string>;
      const carrier = seg.marketing_carrier as Record<string, string>;

      return {
        airline: owner.name,
        flightNumber: `${carrier.iata_code}${seg.marketing_carrier_flight_number as string}`,
        departure: {
          airport: (seg.origin as Record<string, string>).iata_code,
          time: seg.departing_at as string,
        },
        arrival: {
          airport: (lastSeg.destination as Record<string, string>).iata_code,
          time: lastSeg.arriving_at as string,
        },
        duration: parseDuration(slice.duration as string),
        price: {
          amount: offer.total_amount as string,
          currency: offer.total_currency as string,
        },
        stops: segments.length - 1,
      };
    });

    flights.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));

    return {
      success: true,
      data: { flights, originCode, destCode, source: 'duffel' },
    };
  }
}

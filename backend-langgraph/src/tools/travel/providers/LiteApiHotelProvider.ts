import { ToolResult } from '../../../types/tools';
import { HotelProvider, HotelSearchParams, HotelOffer } from './HotelProvider';

const CITY_TO_COUNTRY: Record<string, string> = {
  'paris': 'FR', 'london': 'GB', 'new york': 'US', 'los angeles': 'US',
  'san francisco': 'US', 'miami': 'US', 'chicago': 'US', 'boston': 'US',
  'tokyo': 'JP', 'osaka': 'JP', 'seoul': 'KR', 'beijing': 'CN', 'shanghai': 'CN',
  'hong kong': 'HK', 'singapore': 'SG', 'bangkok': 'TH', 'bali': 'ID',
  'rome': 'IT', 'milan': 'IT', 'barcelona': 'ES', 'madrid': 'ES',
  'amsterdam': 'NL', 'berlin': 'DE', 'frankfurt': 'DE', 'vienna': 'AT',
  'prague': 'CZ', 'lisbon': 'PT', 'istanbul': 'TR', 'dubai': 'AE',
  'sydney': 'AU', 'melbourne': 'AU', 'toronto': 'CA', 'montreal': 'CA',
  'tel aviv': 'IL', 'jerusalem': 'IL', 'cairo': 'EG',
};

function resolveCountry(city: string): string {
  return CITY_TO_COUNTRY[city.toLowerCase().trim()] ?? 'US';
}

const BASE_URL = 'https://api.liteapi.travel/v3.0';

async function liteApiGet(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteAPI ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function liteApiPost(apiKey: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteAPI ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export class LiteApiHotelProvider implements HotelProvider {
  constructor(private readonly apiKey: string) {}

  async search(params: HotelSearchParams): Promise<ToolResult> {
    const countryCode = resolveCountry(params.city);
    const nights = Math.max(1, Math.round(
      (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / 86400000,
    ));

    // Step 1: get hotel IDs for city
    const hotelsResp = await liteApiGet(
      this.apiKey,
      `/data/hotels?countryCode=${countryCode}&cityName=${encodeURIComponent(params.city)}&limit=20`,
    ) as { data?: Record<string, unknown>[] };

    const hotels = hotelsResp.data ?? [];
    if (hotels.length === 0) {
      return {
        success: true,
        data: { hotels: [], city: params.city, message: 'No hotels found.', source: 'liteapi' },
      };
    }

    const hotelIds = hotels.slice(0, 10).map(h => h.id as string);

    // Step 2: get rates
    const ratesResp = await liteApiPost(this.apiKey, '/hotels/rates', {
      hotelIds,
      checkin: params.checkIn,
      checkout: params.checkOut,
      currency: 'USD',
      guestNationality: 'US',
      occupancies: [{ rooms: 1, adults: params.guests, children: [] }],
    }) as { data?: Record<string, unknown>[] };

    const rateData = ratesResp.data ?? [];
    if (rateData.length === 0) {
      return {
        success: true,
        data: { hotels: [], city: params.city, message: 'No rates available for these dates.', source: 'liteapi' },
      };
    }

    // Merge hotel metadata with rates
    const hotelMap = new Map(hotels.map(h => [h.id as string, h]));

    let offers: HotelOffer[] = rateData
      .map(r => {
        const meta = hotelMap.get(r.hotelId as string) ?? {};
        const roomTypes = r.roomTypes as Record<string, unknown>[] ?? [];
        const firstRate = (roomTypes[0]?.rates as Record<string, unknown>[])?.[0];
        const total = (firstRate?.retailRate as Record<string, unknown>)?.total as { amount: number; currency: string }[] | undefined;
        const totalAmount = total?.[0]?.amount ?? 0;
        const pricePerNight = nights > 0 ? Math.round(totalAmount / nights) : totalAmount;
        const cancellationTag = (firstRate?.cancellationPolicies as Record<string, unknown>)?.refundableTag as string ?? '';

        return {
          name: (meta.name ?? r.hotelId) as string,
          stars: (meta.stars ?? 3) as number,
          address: (meta.address ?? '') as string,
          pricePerNight,
          totalPrice: Math.round(totalAmount),
          currency: total?.[0]?.currency ?? 'USD',
          rating: (meta.rating ?? 0) as number,
          reviewCount: (meta.reviewCount ?? 0) as number,
          amenities: [],
          roomType: ((firstRate?.name ?? roomTypes[0]?.name) ?? 'Standard Room') as string,
          cancellationPolicy: cancellationTag === 'FREECANCELLATION'
            ? 'Free cancellation available'
            : cancellationTag === 'NONREFUNDABLE'
              ? 'Non-refundable'
              : 'See hotel policy',
        } as HotelOffer;
      })
      .filter(h => h.totalPrice > 0);

    if (params.stars !== undefined) offers = offers.filter(h => h.stars >= (params.stars ?? 0));
    if (params.maxPrice !== undefined) offers = offers.filter(h => h.pricePerNight <= (params.maxPrice ?? Infinity));
    offers.sort((a, b) => a.pricePerNight - b.pricePerNight);
    offers = offers.slice(0, params.maxResults);

    return {
      success: true,
      data: {
        hotels: offers,
        city: params.city,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        nights,
        guests: params.guests,
        source: 'liteapi',
      },
    };
  }
}

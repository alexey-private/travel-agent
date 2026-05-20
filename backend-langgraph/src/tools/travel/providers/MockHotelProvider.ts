import { ToolResult } from '../../../types/tools';
import { HotelProvider, HotelSearchParams, HotelOffer } from './HotelProvider';

const HOTEL_CHAINS = [
  { name: 'Grand Hyatt', stars: 5 }, { name: 'Marriott', stars: 5 },
  { name: 'Hilton', stars: 5 }, { name: 'InterContinental', stars: 5 },
  { name: 'Sheraton', stars: 4 }, { name: 'Novotel', stars: 4 },
  { name: 'Radisson Blu', stars: 4 }, { name: 'Holiday Inn', stars: 3 },
  { name: 'ibis', stars: 3 }, { name: 'Best Western', stars: 3 },
];

const AMENITIES_POOL = [
  'Free WiFi', 'Pool', 'Spa', 'Gym', 'Restaurant', 'Bar', 'Room Service',
  'Parking', 'Airport Shuttle', 'Business Center', 'Concierge', 'Laundry',
  'Breakfast Included', 'Pet Friendly', 'EV Charging',
];

const ROOM_TYPES = ['Standard Room', 'Deluxe Room', 'Superior Room', 'Junior Suite', 'Suite'];

const CANCELLATION_POLICIES = [
  'Free cancellation up to 24h before check-in',
  'Free cancellation up to 48h before check-in',
  'Non-refundable',
  'Free cancellation up to 7 days before check-in',
];

function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

export class MockHotelProvider implements HotelProvider {
  async search(params: HotelSearchParams): Promise<ToolResult> {
    const nights = Math.max(1, Math.round(
      (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / 86400000,
    ));
    const seed = `${params.city.toLowerCase()}${params.checkIn}${params.checkOut}`;
    let hotels: HotelOffer[] = [];

    for (let i = 0; i < HOTEL_CHAINS.length; i++) {
      const chain = HOTEL_CHAINS[i];
      const basePricePerNight = chain.stars === 5
        ? 250 + Math.floor(seededRand(seed, i * 7) * 400)
        : chain.stars === 4
          ? 120 + Math.floor(seededRand(seed, i * 7) * 180)
          : 60 + Math.floor(seededRand(seed, i * 7) * 90);

      const pricePerNight = basePricePerNight * (params.guests > 2 ? 1 + (params.guests - 2) * 0.2 : 1);
      const totalPrice = Math.round(pricePerNight * nights);

      const amenities: string[] = [];
      const used = new Set<number>();
      const amenityCount = 4 + Math.floor(seededRand(seed, i * 3 + 1) * 5);
      for (let j = 0; j < amenityCount; j++) {
        const idx = Math.floor(seededRand(seed, i * 13 + j * 3) * AMENITIES_POOL.length);
        if (!used.has(idx)) { used.add(idx); amenities.push(AMENITIES_POOL[idx]); }
      }

      hotels.push({
        name: `${chain.name} ${params.city}`,
        stars: chain.stars,
        address: `${1 + Math.floor(seededRand(seed, i * 23 + 7) * 200)} Central District, ${params.city}`,
        pricePerNight: Math.round(pricePerNight),
        totalPrice,
        currency: 'USD',
        rating: Math.round((3.5 + seededRand(seed, i * 9 + 5) * 1.5) * 10) / 10,
        reviewCount: 50 + Math.floor(seededRand(seed, i * 17 + 6) * 2000),
        amenities,
        roomType: ROOM_TYPES[Math.floor(seededRand(seed, i * 11 + 2) * ROOM_TYPES.length)],
        cancellationPolicy: CANCELLATION_POLICIES[Math.floor(seededRand(seed, i * 5 + 4) * CANCELLATION_POLICIES.length)],
      });
    }

    if (params.stars !== undefined) hotels = hotels.filter(h => h.stars >= (params.stars ?? 0));
    if (params.maxPrice !== undefined) hotels = hotels.filter(h => h.pricePerNight <= (params.maxPrice ?? Infinity));
    hotels.sort((a, b) => a.pricePerNight - b.pricePerNight);
    hotels = hotels.slice(0, params.maxResults);

    return {
      success: true,
      data: {
        hotels,
        city: params.city,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        nights,
        guests: params.guests,
        note: 'Sample data for demonstration purposes.',
        source: 'mock',
      },
    };
  }
}

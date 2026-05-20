import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface HotelSearchInput {
  city: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  maxResults?: number;
  maxPrice?: number;
  stars?: number;
}

interface HotelOffer {
  name: string;
  stars: number;
  address: string;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  rating: number;
  reviewCount: number;
  amenities: string[];
  roomType: string;
  cancellationPolicy: string;
}

function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

const HOTEL_CHAINS: { name: string; stars: number }[] = [
  { name: 'Grand Hyatt', stars: 5 },
  { name: 'Marriott', stars: 5 },
  { name: 'Hilton', stars: 5 },
  { name: 'InterContinental', stars: 5 },
  { name: 'Sheraton', stars: 4 },
  { name: 'Novotel', stars: 4 },
  { name: 'Radisson Blu', stars: 4 },
  { name: 'Holiday Inn', stars: 3 },
  { name: 'ibis', stars: 3 },
  { name: 'Best Western', stars: 3 },
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

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 86400000));

    const seed = `${city.toLowerCase()}${checkIn}${checkOut}`;
    const count = Math.min(maxResults, 6);

    let hotels: HotelOffer[] = [];

    for (let i = 0; i < HOTEL_CHAINS.length; i++) {
      const chain = HOTEL_CHAINS[i];
      const starRating = chain.stars;

      const basePricePerNight = starRating === 5
        ? 250 + Math.floor(seededRand(seed, i * 7) * 400)
        : starRating === 4
          ? 120 + Math.floor(seededRand(seed, i * 7) * 180)
          : 60 + Math.floor(seededRand(seed, i * 7) * 90);

      const pricePerNight = basePricePerNight * (guests > 2 ? 1 + (guests - 2) * 0.2 : 1);
      const totalPrice = Math.round(pricePerNight * nights);

      const amenityCount = 4 + Math.floor(seededRand(seed, i * 3 + 1) * 5);
      const amenities: string[] = [];
      const amenityIndices = new Set<number>();
      for (let j = 0; j < amenityCount; j++) {
        const idx = Math.floor(seededRand(seed, i * 13 + j * 3) * AMENITIES_POOL.length);
        amenityIndices.add(idx);
      }
      amenityIndices.forEach(idx => amenities.push(AMENITIES_POOL[idx]));

      const roomTypeIdx = Math.floor(seededRand(seed, i * 11 + 2) * ROOM_TYPES.length);
      const cancellationIdx = Math.floor(seededRand(seed, i * 5 + 4) * CANCELLATION_POLICIES.length);
      const rating = Math.round((3.5 + seededRand(seed, i * 9 + 5) * 1.5) * 10) / 10;
      const reviewCount = 50 + Math.floor(seededRand(seed, i * 17 + 6) * 2000);
      const streetNum = 1 + Math.floor(seededRand(seed, i * 23 + 7) * 200);

      hotels.push({
        name: `${chain.name} ${city}`,
        stars: starRating,
        address: `${streetNum} Central District, ${city}`,
        pricePerNight: Math.round(pricePerNight),
        totalPrice,
        currency: 'USD',
        rating,
        reviewCount,
        amenities,
        roomType: ROOM_TYPES[roomTypeIdx],
        cancellationPolicy: CANCELLATION_POLICIES[cancellationIdx],
      });
    }

    if (stars !== undefined) {
      hotels = hotels.filter(h => h.stars >= stars);
    }
    if (maxPrice !== undefined) {
      hotels = hotels.filter(h => h.pricePerNight <= maxPrice);
    }

    hotels.sort((a, b) => a.pricePerNight - b.pricePerNight);
    hotels = hotels.slice(0, count);

    if (hotels.length === 0) {
      return {
        success: true,
        data: {
          hotels: [],
          message: `No hotels found in ${city} matching your criteria. Try adjusting price or star rating filters.`,
        },
      };
    }

    return {
      success: true,
      data: {
        hotels,
        city,
        checkIn,
        checkOut,
        nights,
        guests,
        note: 'Sample data for demonstration purposes. Prices and availability are illustrative.',
      },
    };
  }
}

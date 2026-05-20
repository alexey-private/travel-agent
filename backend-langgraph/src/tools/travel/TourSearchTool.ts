import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface TourSearchInput {
  destination: string;
  tourType?: 'cultural' | 'adventure' | 'food' | 'nature' | 'historical' | 'cruise' | 'family';
  durationDays?: number;
  maxPrice?: number;
  maxResults?: number;
}

interface TourOffer {
  name: string;
  operator: string;
  destination: string;
  tourType: string;
  durationDays: number;
  groupSize: string;
  price: number;
  currency: string;
  priceIncludes: string[];
  highlights: string[];
  difficulty: 'easy' | 'moderate' | 'challenging';
  rating: number;
  reviewCount: number;
  departureFrequency: string;
}

function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

const TOUR_OPERATORS = [
  'G Adventures', 'Intrepid Travel', 'Contiki', 'Trafalgar', 'Viator',
  'National Geographic Expeditions', 'TUI', 'Cox & Kings', 'Abercrombie & Kent',
];

const TOUR_TEMPLATES: Record<string, { names: string[]; highlights: string[]; priceBase: number; difficulty: 'easy' | 'moderate' | 'challenging' }[]> = {
  cultural: [
    { names: ['Cultural Immersion', 'Heritage & Traditions', 'Art & Architecture'], highlights: ['Local market visits', 'Museum tours', 'Traditional cooking class', 'Meet local artisans', 'Ancient temples'], priceBase: 1200, difficulty: 'easy' },
  ],
  adventure: [
    { names: ['Adrenaline Rush', 'Extreme Explorer', 'Wild Adventure'], highlights: ['Hiking', 'Rock climbing', 'White-water rafting', 'Zip-lining', 'Paragliding'], priceBase: 1800, difficulty: 'challenging' },
  ],
  food: [
    { names: ['Culinary Journey', 'Food & Wine Discovery', 'Street Food Tour'], highlights: ['Street food tour', 'Cooking masterclass', 'Wine tasting', 'Farm-to-table dinner', 'Market visit with chef'], priceBase: 900, difficulty: 'easy' },
  ],
  nature: [
    { names: ['Wildlife Safari', 'Nature Explorer', 'Eco Adventure'], highlights: ['Wildlife spotting', 'Birdwatching', 'Jungle trekking', 'Botanical gardens', 'National park visits'], priceBase: 2200, difficulty: 'moderate' },
  ],
  historical: [
    { names: ['Ancient Wonders', 'History & Legends', 'Archaeological Journey'], highlights: ['Archaeological sites', 'Expert historian guide', 'UNESCO World Heritage sites', 'Ancient ruins', 'Historical museums'], priceBase: 1500, difficulty: 'easy' },
  ],
  cruise: [
    { names: ['River Cruise', 'Island Hopping Cruise', 'Scenic Waterway'], highlights: ['Scenic waterways', 'Onboard dining', 'Shore excursions', 'Sunset cocktail cruises', 'Private island stops'], priceBase: 2800, difficulty: 'easy' },
  ],
  family: [
    { names: ['Family Fun Adventure', 'Kids & Culture', 'Family Explorer'], highlights: ['Kid-friendly activities', 'Theme parks', 'Interactive museums', 'Beach time', 'Animal encounters'], priceBase: 1400, difficulty: 'easy' },
  ],
};

const INCLUDES_OPTIONS = [
  'Accommodation (hotel)', 'Breakfast daily', 'All meals', 'Airport transfers',
  'Professional guide', 'Entrance fees', 'Internal flights', 'Ground transportation',
  'Travel insurance', 'Welcome dinner',
];

const DEPARTURE_FREQUENCIES = [
  'Daily departures', 'Weekly on Saturdays', 'Every Monday & Friday',
  'Twice monthly', 'Monthly departures', 'Year-round departures',
];

const ALL_TOUR_TYPES = ['cultural', 'adventure', 'food', 'nature', 'historical', 'cruise', 'family'] as const;

export class TourSearchTool extends BaseTool {
  readonly name = 'search_tours';
  readonly description =
    'Search for guided tours and tour packages in a destination. Returns tours with itinerary highlights, pricing, duration, operator details, and group size. ' +
    'Use when the user asks about guided tours, tour packages, group travel, or organized trips.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: 'Destination city or country for the tour (e.g. "Peru", "Kyoto", "Morocco")',
      },
      tourType: {
        type: 'string',
        enum: ['cultural', 'adventure', 'food', 'nature', 'historical', 'cruise', 'family'],
        description: 'Type of tour. Omit to see all types.',
      },
      durationDays: {
        type: 'number',
        description: 'Preferred tour duration in days (e.g. 7 for a week-long tour)',
        minimum: 1,
        maximum: 30,
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price per person in USD',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of tours to return (default: 4, max: 6)',
        minimum: 1,
        maximum: 6,
      },
    },
    required: ['destination'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { destination, tourType, durationDays, maxPrice, maxResults = 4 } = input as TourSearchInput;

    const seed = `${destination.toLowerCase()}${tourType ?? 'all'}${durationDays ?? 0}`;
    const count = Math.min(maxResults, 6);
    const types = tourType ? [tourType] : ALL_TOUR_TYPES;

    let tours: TourOffer[] = [];

    for (let i = 0; i < 10 && tours.length < count * 2; i++) {
      const typeIdx = Math.floor(seededRand(seed, i * 7) * types.length);
      const type = types[typeIdx];
      const template = TOUR_TEMPLATES[type][0];

      const baseDuration = durationDays ?? (3 + Math.floor(seededRand(seed, i * 11 + 1) * 12));
      const actualDuration = durationDays ?? baseDuration;

      const priceVariance = 0.8 + seededRand(seed, i * 13 + 2) * 0.5;
      const price = Math.round(template.priceBase * priceVariance * (actualDuration / 7));

      const nameIdx = Math.floor(seededRand(seed, i * 17 + 3) * template.names.length);
      const operatorIdx = Math.floor(seededRand(seed, i * 19 + 4) * TOUR_OPERATORS.length);

      const includeCount = 3 + Math.floor(seededRand(seed, i * 23 + 5) * 4);
      const includes: string[] = [];
      const usedIncludes = new Set<number>();
      for (let j = 0; j < includeCount; j++) {
        const idx = Math.floor(seededRand(seed, i * 29 + j * 3) * INCLUDES_OPTIONS.length);
        if (!usedIncludes.has(idx)) { usedIncludes.add(idx); includes.push(INCLUDES_OPTIONS[idx]); }
      }

      const highlightCount = 3 + Math.floor(seededRand(seed, i * 31 + 6) * 3);
      const highlights = template.highlights.slice(0, highlightCount);

      const minGroup = 4 + Math.floor(seededRand(seed, i * 37 + 7) * 8);
      const maxGroup = minGroup + 4 + Math.floor(seededRand(seed, i * 41 + 8) * 8);
      const rating = Math.round((4.0 + seededRand(seed, i * 43 + 9) * 1.0) * 10) / 10;
      const reviewCount = 20 + Math.floor(seededRand(seed, i * 47 + 10) * 500);
      const freqIdx = Math.floor(seededRand(seed, i * 53 + 11) * DEPARTURE_FREQUENCIES.length);

      tours.push({
        name: `${destination} ${template.names[nameIdx]}`,
        operator: TOUR_OPERATORS[operatorIdx],
        destination,
        tourType: type,
        durationDays: actualDuration,
        groupSize: `${minGroup}–${maxGroup} people`,
        price,
        currency: 'USD',
        priceIncludes: includes,
        highlights,
        difficulty: template.difficulty,
        rating,
        reviewCount,
        departureFrequency: DEPARTURE_FREQUENCIES[freqIdx],
      });
    }

    if (maxPrice !== undefined) {
      tours = tours.filter(t => t.price <= maxPrice);
    }

    tours.sort((a, b) => a.price - b.price);
    tours = tours.slice(0, count);

    if (tours.length === 0) {
      return {
        success: true,
        data: {
          tours: [],
          message: `No tours found for ${destination} matching your criteria. Try adjusting filters or use web_search for more options.`,
        },
      };
    }

    return {
      success: true,
      data: {
        tours,
        destination,
        note: 'Sample data for demonstration purposes. Prices and schedules are illustrative.',
      },
    };
  }
}

import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface SpaSearchInput {
  city: string;
  treatmentType?: 'massage' | 'facial' | 'body' | 'wellness' | 'thermal' | 'ayurveda';
  maxPrice?: number;
  maxResults?: number;
}

interface SpaOffer {
  name: string;
  city: string;
  type: string;
  rating: number;
  reviewCount: number;
  priceRange: string;
  signature: string;
  treatments: string[];
  amenities: string[];
  durationOptions: string[];
  address: string;
  bookingRequired: boolean;
  highlights: string;
}

function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

const SPA_NAMES = [
  'Serenity Spa', 'The Wellness Retreat', 'Bliss Spa', 'Harmony Wellness Center',
  'Zen Garden Spa', 'The Renewal Spa', 'Tranquil Waters', 'Lotus Spa & Wellness',
  'Elixir Day Spa', 'The Sanctuary', 'Aurora Spa', 'Eden Wellness',
];

const TREATMENT_MENUS: Record<string, { signature: string; treatments: string[] }> = {
  massage: {
    signature: 'Hot Stone Full Body Massage',
    treatments: ['Swedish Massage', 'Deep Tissue Massage', 'Hot Stone Massage', 'Thai Massage', 'Aromatherapy Massage', 'Sports Massage', 'Couples Massage'],
  },
  facial: {
    signature: 'Anti-Aging Collagen Facial',
    treatments: ['Hydrating Facial', 'Anti-Aging Facial', 'Deep Cleansing Facial', 'Microdermabrasion', 'LED Light Therapy', 'Chemical Peel', 'Gold Facial'],
  },
  body: {
    signature: 'Mediterranean Salt Scrub & Wrap',
    treatments: ['Salt Scrub', 'Body Wrap', 'Mud Treatment', 'Exfoliation', 'Body Polishing', 'Slimming Wrap', 'Detox Body Treatment'],
  },
  wellness: {
    signature: 'Full Day Wellness Journey',
    treatments: ['Yoga Session', 'Meditation', 'Sound Bath', 'Nutrition Consultation', 'Breathwork', 'Reiki', 'Crystal Healing', 'Infrared Sauna'],
  },
  thermal: {
    signature: 'Thermal Circuit Experience',
    treatments: ['Steam Room', 'Finnish Sauna', 'Ice Pool', 'Tepidarium', 'Hammam', 'Roman Bath', 'Flotation Tank', 'Hydrotherapy'],
  },
  ayurveda: {
    signature: 'Abhyanga Ayurvedic Oil Massage',
    treatments: ['Shirodhara', 'Abhyanga', 'Panchakarma', 'Marma Therapy', 'Herbal Steam', 'Nasya', 'Ayurvedic Consultation'],
  },
};

const SPA_AMENITIES = [
  'Thermal pools', 'Sauna', 'Steam room', 'Relaxation lounge', 'Healthy café',
  'Changing rooms', 'Jacuzzi', 'Meditation garden', 'Indoor pool', 'Gym access',
];

const PRICE_RANGES = [
  { label: '$50–$100', min: 50, max: 100 },
  { label: '$100–$200', min: 100, max: 200 },
  { label: '$150–$300', min: 150, max: 300 },
  { label: '$200–$500', min: 200, max: 500 },
];

const DURATION_OPTIONS = ['30 min', '60 min', '90 min', '120 min', 'Half day (4h)', 'Full day (8h)'];

const ALL_TREATMENT_TYPES = ['massage', 'facial', 'body', 'wellness', 'thermal', 'ayurveda'] as const;

export class SpaSearchTool extends BaseTool {
  readonly name = 'search_spas';
  readonly description =
    'Search for spas and wellness centers in a city. Returns options with treatments, pricing, amenities, and ratings. ' +
    'Use when the user asks about spas, wellness centers, massages, beauty treatments, relaxation, or self-care experiences at a destination.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City to search spas in (e.g. "Bali", "Paris", "Bangkok")',
      },
      treatmentType: {
        type: 'string',
        enum: ['massage', 'facial', 'body', 'wellness', 'thermal', 'ayurveda'],
        description: 'Type of treatment or spa focus. Omit to see all types.',
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price per treatment in USD',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of spas to return (default: 4, max: 6)',
        minimum: 1,
        maximum: 6,
      },
    },
    required: ['city'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { city, treatmentType, maxPrice, maxResults = 4 } = input as SpaSearchInput;

    const seed = `${city.toLowerCase()}${treatmentType ?? 'all'}`;
    const count = Math.min(maxResults, 6);
    const types = treatmentType ? [treatmentType] : ALL_TREATMENT_TYPES;

    let spas: SpaOffer[] = [];

    for (let i = 0; i < SPA_NAMES.length && spas.length < count * 2; i++) {
      const typeIdx = Math.floor(seededRand(seed, i * 7) * types.length);
      const type = types[typeIdx];
      const menu = TREATMENT_MENUS[type];

      const priceRangeIdx = Math.floor(seededRand(seed, i * 11 + 1) * PRICE_RANGES.length);
      const priceRange = PRICE_RANGES[priceRangeIdx];

      if (maxPrice !== undefined && priceRange.min > maxPrice) continue;

      const nameIdx = Math.floor(seededRand(seed, i * 13 + 2) * SPA_NAMES.length);
      const rating = Math.round((4.0 + seededRand(seed, i * 17 + 3) * 1.0) * 10) / 10;
      const reviewCount = 30 + Math.floor(seededRand(seed, i * 19 + 4) * 800);

      const amenityCount = 4 + Math.floor(seededRand(seed, i * 23 + 5) * 4);
      const amenities: string[] = [];
      const usedAmenities = new Set<number>();
      for (let j = 0; j < amenityCount; j++) {
        const idx = Math.floor(seededRand(seed, i * 29 + j * 5) * SPA_AMENITIES.length);
        if (!usedAmenities.has(idx)) { usedAmenities.add(idx); amenities.push(SPA_AMENITIES[idx]); }
      }

      const durationCount = 2 + Math.floor(seededRand(seed, i * 31 + 6) * 3);
      const durations = DURATION_OPTIONS.slice(0, durationCount);

      const treatmentCount = 3 + Math.floor(seededRand(seed, i * 37 + 7) * 4);
      const treatments = menu.treatments.slice(0, treatmentCount);

      const streetNum = 1 + Math.floor(seededRand(seed, i * 41 + 8) * 150);
      const bookingRequired = seededRand(seed, i * 43 + 9) > 0.3;

      const highlights = [
        `Specializing in ${type} treatments`,
        `${reviewCount}+ satisfied guests`,
        priceRange.label.includes('$50') ? 'Budget-friendly luxury' : 'Premium experience',
      ].join(' · ');

      spas.push({
        name: SPA_NAMES[nameIdx] + (spas.some(s => s.name === SPA_NAMES[nameIdx]) ? ` ${city}` : ''),
        city,
        type: type.charAt(0).toUpperCase() + type.slice(1),
        rating,
        reviewCount,
        priceRange: priceRange.label,
        signature: menu.signature,
        treatments,
        amenities,
        durationOptions: durations,
        address: `${streetNum} Wellness District, ${city}`,
        bookingRequired,
        highlights,
      });
    }

    spas.sort((a, b) => b.rating - a.rating);
    spas = spas.slice(0, count);

    if (spas.length === 0) {
      return {
        success: true,
        data: {
          spas: [],
          message: `No spas found in ${city} matching your criteria. Try adjusting filters.`,
        },
      };
    }

    return {
      success: true,
      data: {
        spas,
        city,
        note: 'Sample data for demonstration purposes. Prices and availability are illustrative.',
      },
    };
  }
}

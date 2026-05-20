import { ToolResult } from '../../../types/tools';

export interface SpaSearchParams {
  city: string;
  treatmentType?: 'massage' | 'facial' | 'body' | 'wellness' | 'thermal' | 'ayurveda';
  maxPrice?: number;
  maxResults: number;
}

export interface SpaOffer {
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

export interface SpaProvider {
  search(params: SpaSearchParams): Promise<ToolResult>;
}

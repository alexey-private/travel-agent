import { ToolResult } from '../../../types/tools';

export interface TourSearchParams {
  destination: string;
  tourType?: 'cultural' | 'adventure' | 'food' | 'nature' | 'historical' | 'cruise' | 'family';
  durationDays?: number;
  maxPrice?: number;
  maxResults: number;
}

export interface TourOffer {
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

export interface TourProvider {
  search(params: TourSearchParams): Promise<ToolResult>;
}

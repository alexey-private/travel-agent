import { ToolResult } from '../../../types/tools';

export interface HotelSearchParams {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  maxResults: number;
  maxPrice?: number;
  stars?: number;
}

export interface HotelOffer {
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

export interface HotelProvider {
  search(params: HotelSearchParams): Promise<ToolResult>;
}

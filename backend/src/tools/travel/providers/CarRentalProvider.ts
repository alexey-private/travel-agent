import { ToolResult } from '../../../types/tools';

export interface CarRentalSearchParams {
  city: string;
  pickupDate: string;
  returnDate: string;
  carClass?: 'economy' | 'compact' | 'midsize' | 'suv' | 'luxury' | 'van';
  maxResults: number;
}

export interface CarRentalOffer {
  company: string;
  carModel: string;
  carClass: string;
  seats: number;
  transmission: 'automatic' | 'manual';
  pricePerDay: number;
  totalPrice: number;
  currency: string;
  includes: string[];
  extras: string[];
  freeCancellation: boolean;
  pickupLocation: string;
}

export interface CarRentalProvider {
  search(params: CarRentalSearchParams): Promise<ToolResult>;
}

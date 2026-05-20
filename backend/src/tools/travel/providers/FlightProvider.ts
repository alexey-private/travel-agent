import { ToolResult } from '../../../types/tools';

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  maxResults: number;
}

export interface FlightOffer {
  airline: string;
  flightNumber: string;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  duration: string;
  price: { amount: string; currency: string };
  stops: number;
}

export interface FlightProvider {
  search(params: FlightSearchParams): Promise<ToolResult>;
}

import { buildAgentGraph } from './buildGraph';
import { buildTravelAgentSystemPrompt } from '../agent/prompts';
import { WebSearchTool } from '../tools/WebSearchTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { CalendarTool } from '../tools/CalendarTool';
import { WeatherTool } from '../tools/travel/WeatherTool';
import { CountryInfoTool } from '../tools/travel/CountryInfoTool';
import { FlightSearchTool } from '../tools/travel/FlightSearchTool';
import { HotelSearchTool } from '../tools/travel/HotelSearchTool';
import { VisaRequirementsTool } from '../tools/travel/VisaRequirementsTool';
import { CarRentalTool } from '../tools/travel/CarRentalTool';
import { TourSearchTool } from '../tools/travel/TourSearchTool';
import { SpaSearchTool } from '../tools/travel/SpaSearchTool';
import { CalendarProvider } from '../tools/providers/CalendarProvider';
import { UserMemory } from '../types/memory';

export function buildTravelGraph(memories: UserMemory[], calendarProvider?: CalendarProvider, sessionId?: string) {
  return buildAgentGraph(
    [
      new WebSearchTool(),
      new WeatherTool(),
      new CountryInfoTool(),
      new CurrencyTool(),
      new FlightSearchTool(),
      new HotelSearchTool(),
      new VisaRequirementsTool(),
      new CarRentalTool(),
      new TourSearchTool(),
      new SpaSearchTool(),
      calendarProvider ? new CalendarTool(calendarProvider) : new CalendarTool(),
    ],
    buildTravelAgentSystemPrompt(memories, sessionId),
  );
}

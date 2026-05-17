import { buildAgentGraph } from './buildGraph';
import { buildTravelAgentSystemPrompt } from '../agent/prompts';
import { WebSearchTool } from '../tools/WebSearchTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { WeatherTool } from '../tools/travel/WeatherTool';
import { CountryInfoTool } from '../tools/travel/CountryInfoTool';
import { FlightSearchTool } from '../tools/travel/FlightSearchTool';
import { UserMemory } from '../types/memory';

export function buildTravelGraph(memories: UserMemory[]) {
  return buildAgentGraph(
    [new WebSearchTool(), new WeatherTool(), new CountryInfoTool(), new CurrencyTool(), new FlightSearchTool()],
    buildTravelAgentSystemPrompt(memories),
  );
}

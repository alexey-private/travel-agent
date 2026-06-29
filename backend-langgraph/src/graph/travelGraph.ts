import { buildAgentGraph } from './buildGraph';
import { buildTravelAgentSystemPrompt } from '../agent/prompts';
import { AgentStateType } from './state';
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
import { TasksProvider } from '../tools/providers/TasksProvider';
import { TasksTool } from '../tools/TasksTool';
import { SearchConversationsTool } from '../tools/SearchConversationsTool';
import { ConversationService } from '../services/ConversationService';

export type CompiledTravelGraph = ReturnType<typeof buildAgentGraph>;

export function createTravelGraph(
  calendarProvider: CalendarProvider,
  tasksProvider: TasksProvider,
  conversationService: ConversationService,
): CompiledTravelGraph {
  const tools = [
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
    new CalendarTool(calendarProvider),
    new TasksTool(tasksProvider),
    new SearchConversationsTool(conversationService),
  ];

  return buildAgentGraph(
    tools,
    (state: AgentStateType) =>
      buildTravelAgentSystemPrompt(state.memories ?? [], state.sessionId, state.taskListName, state.ragContext, state.platform),
  );
}

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

type CompiledTravelGraph = ReturnType<typeof buildAgentGraph>;
let _travelGraph: CompiledTravelGraph | null = null;

/**
 * Initialises the travel agent singleton graph.
 * Call once at server startup after providers are ready.
 * All tools and the compiled StateGraph are reused across every request.
 * Per-request context (memories, sessionId, taskListName) is injected via
 * AgentState and read by the prompt builder inside reasonNode.
 */
export function initTravelGraph(
  calendarProvider: CalendarProvider,
  tasksProvider: TasksProvider,
  conversationService: ConversationService,
): void {
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

  _travelGraph = buildAgentGraph(
    tools,
    (state: AgentStateType) =>
      buildTravelAgentSystemPrompt(state.memories ?? [], state.userId, state.taskListName, state.ragContext),
  );
}

/**
 * Returns the pre-compiled travel agent graph.
 * Throws if initTravelGraph() was not called at startup.
 */
export function getTravelGraph(): CompiledTravelGraph {
  if (!_travelGraph) throw new Error('Travel graph not initialised — call initTravelGraph() first');
  return _travelGraph;
}

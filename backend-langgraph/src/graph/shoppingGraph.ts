import { buildAgentGraph } from './buildGraph';
import { buildShoppingAgentSystemPrompt } from '../agent/prompts';
import { AgentStateType } from './state';
import { WebSearchTool } from '../tools/WebSearchTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { CalendarTool } from '../tools/CalendarTool';
import { ProductSearchTool } from '../tools/shopping/ProductSearchTool';
import { PriceCompareTool } from '../tools/shopping/PriceCompareTool';
import { ProductReviewsTool } from '../tools/shopping/ProductReviewsTool';
import { DealSearchTool } from '../tools/shopping/DealSearchTool';
import { WishlistTool } from '../tools/shopping/WishlistTool';
import { PriceAlertTool } from '../tools/shopping/PriceAlertTool';
import { CalendarProvider } from '../tools/providers/CalendarProvider';
import { TasksProvider } from '../tools/providers/TasksProvider';
import { TasksTool } from '../tools/TasksTool';
import { SearchConversationsTool } from '../tools/SearchConversationsTool';
import { ConversationService } from '../services/ConversationService';
import { RAGService } from '../services/RAGService';

export type CompiledShoppingGraph = ReturnType<typeof buildAgentGraph>;

export function createShoppingGraph(
  ragService: RAGService,
  calendarProvider: CalendarProvider,
  tasksProvider: TasksProvider,
  conversationService: ConversationService,
): CompiledShoppingGraph {
  const tools = [
    new ProductSearchTool(ragService),
    new PriceCompareTool(),
    new ProductReviewsTool(ragService),
    new DealSearchTool(),
    new CurrencyTool(),
    new WebSearchTool(),
    new WishlistTool(),
    new PriceAlertTool(),
    new CalendarTool(calendarProvider),
    new TasksTool(tasksProvider),
    new SearchConversationsTool(conversationService),
  ];

  return buildAgentGraph(
    tools,
    (state: AgentStateType) =>
      buildShoppingAgentSystemPrompt(state.memories ?? [], state.sessionId, state.taskListName, state.ragContext, state.platform),
  );
}

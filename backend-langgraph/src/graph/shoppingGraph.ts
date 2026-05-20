import { buildAgentGraph } from './buildGraph';
import { buildShoppingAgentSystemPrompt } from '../agent/prompts';
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
import { RAGService } from '../services/RAGService';
import { UserMemory } from '../types/memory';

export function buildShoppingGraph(ragService: RAGService, memories: UserMemory[], calendarProvider?: CalendarProvider, tasksProvider?: TasksProvider, sessionId?: string) {
  return buildAgentGraph(
    [
      new ProductSearchTool(ragService),
      new PriceCompareTool(),
      new ProductReviewsTool(ragService),
      new DealSearchTool(),
      new CurrencyTool(),
      new WebSearchTool(),
      new WishlistTool(),
      new PriceAlertTool(),
      calendarProvider ? new CalendarTool(calendarProvider) : new CalendarTool(),
      tasksProvider ? new TasksTool(tasksProvider) : new TasksTool(),
    ],
    buildShoppingAgentSystemPrompt(memories, sessionId),
  );
}

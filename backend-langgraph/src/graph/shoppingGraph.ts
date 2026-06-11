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
import { RAGService } from '../services/RAGService';

type CompiledShoppingGraph = ReturnType<typeof buildAgentGraph>;
let _shoppingGraph: CompiledShoppingGraph | null = null;

/**
 * Initialises the shopping agent singleton graph.
 * Call once at server startup after providers are ready.
 * All tools and the compiled StateGraph are reused across every request.
 * Per-request context (memories, sessionId, taskListName) is injected via
 * AgentState and read by the prompt builder inside reasonNode.
 */
export function initShoppingGraph(
  ragService: RAGService,
  calendarProvider: CalendarProvider,
  tasksProvider: TasksProvider,
): void {
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
  ];

  _shoppingGraph = buildAgentGraph(
    tools,
    (state: AgentStateType) =>
      buildShoppingAgentSystemPrompt(state.memories ?? [], state.sessionId, state.taskListName),
  );
}

/**
 * Returns the pre-compiled shopping agent graph.
 * Throws if initShoppingGraph() was not called at startup.
 */
export function getShoppingGraph(): CompiledShoppingGraph {
  if (!_shoppingGraph) throw new Error('Shopping graph not initialised — call initShoppingGraph() first');
  return _shoppingGraph;
}

import { buildAgentGraph } from './buildGraph';
import { buildShoppingAgentSystemPrompt } from '../agent/prompts';
import { WebSearchTool } from '../tools/WebSearchTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { ProductSearchTool } from '../tools/shopping/ProductSearchTool';
import { PriceCompareTool } from '../tools/shopping/PriceCompareTool';
import { ProductReviewsTool } from '../tools/shopping/ProductReviewsTool';
import { DealSearchTool } from '../tools/shopping/DealSearchTool';
import { RAGService } from '../services/RAGService';
import { UserMemory } from '../types/memory';

export function buildShoppingGraph(ragService: RAGService, memories: UserMemory[]) {
  return buildAgentGraph(
    [new ProductSearchTool(ragService), new PriceCompareTool(), new ProductReviewsTool(ragService), new DealSearchTool(), new CurrencyTool(), new WebSearchTool()],
    buildShoppingAgentSystemPrompt(memories),
  );
}

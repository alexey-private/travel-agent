import { StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentState } from './state';
import { createReasonNode } from './nodes/reasonNode';
import { shouldContinue } from './nodes/shouldContinue';
import { buildShoppingAgentSystemPrompt } from '../agent/prompts';
import { wrapTool } from '../tools/wrapTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { ProductSearchTool } from '../tools/shopping/ProductSearchTool';
import { PriceCompareTool } from '../tools/shopping/PriceCompareTool';
import { ProductReviewsTool } from '../tools/shopping/ProductReviewsTool';
import { DealSearchTool } from '../tools/shopping/DealSearchTool';
import { RAGService } from '../services/RAGService';

/**
 * Builds a compiled LangGraph StateGraph for the Shopping agent.
 *
 * Graph structure is identical to TravelGraph — only the tool set
 * and system prompt differ.
 */
export function buildShoppingGraph(ragService: RAGService, memories: { key: string; value: string }[]) {
  const baseTools = [
    new ProductSearchTool(ragService),
    new PriceCompareTool(),
    new ProductReviewsTool(ragService),
    new DealSearchTool(),
    new CurrencyTool(),
    new WebSearchTool(),
  ];

  const langchainTools: DynamicStructuredTool[] = baseTools.map(wrapTool);
  const systemPrompt = buildShoppingAgentSystemPrompt(memories);

  const reasonNode = createReasonNode(systemPrompt, langchainTools);
  const toolNode = new ToolNode(langchainTools);

  const graph = new StateGraph(AgentState)
    .addNode('reason', reasonNode)
    .addNode('act', toolNode)
    .addEdge(START, 'reason')
    .addConditionalEdges('reason', shouldContinue, { act: 'act', [END]: END })
    .addEdge('act', 'reason')
    .compile();

  return graph;
}

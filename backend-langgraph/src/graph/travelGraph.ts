import { StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentState, AgentStateType } from './state';
import { createReasonNode } from './nodes/reasonNode';
import { shouldContinue } from './nodes/shouldContinue';
import { buildTravelAgentSystemPrompt } from '../agent/prompts';
import { wrapTool } from '../tools/wrapTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { WeatherTool } from '../tools/travel/WeatherTool';
import { CountryInfoTool } from '../tools/travel/CountryInfoTool';
import { FlightSearchTool } from '../tools/travel/FlightSearchTool';
import { RAGService } from '../services/RAGService';

/**
 * Builds a compiled LangGraph StateGraph for the Travel agent.
 *
 * Graph structure:
 *
 *   START → [reason] → shouldContinue → [act] → [reason] → ...
 *                                    ↘ END
 *
 * - "reason": calls the LLM with system prompt + message history
 * - "act":    ToolNode executes all requested tool calls in parallel
 * - shouldContinue: routes back to "reason" if tools were called, otherwise ends
 *
 * The system prompt is built once per request (with user memories injected)
 * and the compiled graph is called with the per-request initial state.
 */
export function buildTravelGraph(ragService: RAGService, memories: { key: string; value: string }[]) {
  const baseTools = [
    new WebSearchTool(),
    new WeatherTool(),
    new CountryInfoTool(),
    new CurrencyTool(),
    new FlightSearchTool(),
  ];

  const langchainTools: DynamicStructuredTool[] = baseTools.map(wrapTool);
  const systemPrompt = buildTravelAgentSystemPrompt(memories);

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

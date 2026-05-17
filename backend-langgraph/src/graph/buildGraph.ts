import { StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentState } from './state';
import { createReasonNode } from './nodes/reasonNode';
import { shouldContinue } from './nodes/shouldContinue';
import { wrapTool } from '../tools/wrapTool';
import { BaseTool } from '../tools/BaseTool';

/**
 * Compiles a ReAct StateGraph from a list of tools and a system prompt.
 *
 * Both Travel and Shopping agents share the same graph topology:
 *   START → [reason] → shouldContinue → [act] → [reason] → ...
 *                                    ↘ END
 *
 * The only differences between agents are the tool set and system prompt,
 * which are injected here as arguments.
 */
export function buildAgentGraph(tools: BaseTool[], systemPrompt: string) {
  const langchainTools: DynamicStructuredTool[] = tools.map(wrapTool);

  const graph = new StateGraph(AgentState)
    .addNode('reason', createReasonNode(systemPrompt, langchainTools))
    .addNode('act', new ToolNode(langchainTools))
    .addEdge(START, 'reason')
    .addConditionalEdges('reason', shouldContinue, { act: 'act', [END]: END })
    .addEdge('act', 'reason')
    .compile();

  return graph;
}

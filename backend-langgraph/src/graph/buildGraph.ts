import { StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentState, AgentStateType } from './state';
import { createReasonNode } from './nodes/reasonNode';
import { shouldContinue } from './nodes/shouldContinue';
import { wrapTool } from '../tools/wrapTool';
import { BaseTool } from '../tools/BaseTool';

/**
 * Compiles a ReAct StateGraph from a list of tools and a system-prompt builder.
 *
 * Both Travel and Shopping agents share the same graph topology:
 *   START → [reason] → shouldContinue → [act] → [reason] → ...
 *                                    ↘ END
 *
 * The prompt builder receives the full state on every reasoning step, so
 * per-request context (memories, sessionId, taskListName) is applied without
 * rebuilding the graph. Call this function once per agent type at server
 * startup and reuse the compiled result across all requests.
 */
export function buildAgentGraph(
  tools: BaseTool[],
  buildSystemPrompt: (state: AgentStateType) => string,
) {
  const langchainTools: DynamicStructuredTool[] = tools.map(wrapTool);

  return new StateGraph(AgentState)
    .addNode('reason', createReasonNode(buildSystemPrompt, langchainTools))
    .addNode('act', new ToolNode(langchainTools))
    .addEdge(START, 'reason')
    .addConditionalEdges('reason', shouldContinue, { act: 'act', [END]: END })
    .addEdge('act', 'reason')
    .compile();
}

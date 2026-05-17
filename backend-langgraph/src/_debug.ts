import { EmbeddingService } from './services/EmbeddingService';
import { RAGService } from './services/RAGService';
import { getPool } from './db/client';
import { buildTravelGraph } from './graph/travelGraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AgentState } from './graph/state';

// Patch shouldContinue to debug
import { END } from '@langchain/langgraph';

async function main() {
  const pool = getPool();
  const ragService = new RAGService(pool, null, new EmbeddingService());
  const graph = buildTravelGraph(ragService, []);

  for await (const event of graph.streamEvents(
    { messages: [new HumanMessage('Best time to visit Bali?')], userId: 'test', conversationId: 'test', agentType: 'travel', memories: [], ragContext: null } as any,
    { version: 'v2' },
  )) {
    if (event.event === 'on_chain_start' && event.name === 'shouldContinue') {
      const msgs = event.data?.input?.messages ?? [];
      const last = msgs.at(-1);
      console.log('shouldContinue input - last msg type:', last?.constructor?.name);
      console.log('tool_calls:', JSON.stringify(last?.tool_calls));
      console.log('additional_kwargs.tool_calls:', JSON.stringify(last?.additional_kwargs?.tool_calls));
    }
    if (event.event === 'on_chain_end' && event.name === 'shouldContinue') {
      console.log('shouldContinue output:', JSON.stringify(event.data?.output));
    }
    if (event.event === 'on_chain_end' && event.name === 'LangGraph') {
      console.log('[GRAPH DONE]'); break;
    }
  }
  await pool.end();
}
main().catch(console.error);

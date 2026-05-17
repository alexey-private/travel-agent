import { EmbeddingService } from './services/EmbeddingService';
import { RAGService } from './services/RAGService';
import { getPool } from './db/client';
import { buildTravelGraph } from './graph/travelGraph';
import { HumanMessage } from '@langchain/core/messages';

async function main() {
  const pool = getPool();
  const ragService = new RAGService(pool, null, new EmbeddingService());
  const graph = buildTravelGraph(ragService, []);

  const ragContext = await ragService.buildRagContext('Best time to visit Bali?');
  const userContent = ragContext
    ? `Relevant travel knowledge:\n${ragContext}\n\nUser request: Best time to visit Bali?`
    : 'Best time to visit Bali?';

  console.log('ragContext exists:', !!ragContext);
  console.log('---');

  for await (const event of graph.streamEvents(
    { messages: [new HumanMessage(userContent)], userId: 'test', conversationId: 'test', agentType: 'travel', memories: [], ragContext } as any,
    { version: 'v2' },
  )) {
    const e = event.event;
    if (e === 'on_chat_model_stream') {
      const content = event.data?.chunk?.content;
      if (content) process.stdout.write(`[TEXT] ${JSON.stringify(content)}\n`);
    }
    if (e === 'on_tool_start') console.log(`[TOOL_START] ${event.name}`);
    if (e === 'on_tool_end') console.log(`[TOOL_END] ${event.name}`);
    if (e === 'on_chain_end' && event.name === 'LangGraph') {
      console.log('[GRAPH DONE]');
      break;
    }
  }
  await pool.end();
}
main().catch(console.error);

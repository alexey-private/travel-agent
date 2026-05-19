import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { getPool } from '../db/client';
import { UserService } from '../services/UserService';
import { ConversationService } from '../services/ConversationService';
import { MemoryService } from '../services/MemoryService';
import { RAGService } from '../services/RAGService';
import { EmbeddingService } from '../services/EmbeddingService';
import { SuggestionService } from '../services/SuggestionService';
import { buildTravelGraph } from '../graph/travelGraph';
import { buildShoppingGraph } from '../graph/shoppingGraph';
import { AgentEvent } from '../types/agent';

interface ChatBody {
  userId: string;
  message: string;
  conversationId?: string;
  agentType?: 'travel' | 'shopping';
}

interface Source {
  title: string;
  url: string;
}

/**
 * POST /api/chat — LangGraph SSE streaming endpoint.
 *
 * SSE event format (same as the original backend so the frontend works unchanged):
 *   { type: 'conversation_id', conversationId }
 *   { type: 'text', content }
 *   { type: 'tool_start', tool, input }
 *   { type: 'tool_end', tool, output, error? }
 *   { type: 'sources', sources }
 *   { type: 'suggestions', suggestions }
 *   { type: 'done' }
 *
 * Mapped from graph.streamEvents() v2:
 *   on_chat_model_stream → text
 *   on_tool_start        → tool_start
 *   on_tool_end          → tool_end
 */
export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: ChatBody }>(
    '/api/chat',
    async (request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
      const { userId: sessionId, message, conversationId: existingConvId, agentType = 'travel' } = request.body;

      if (!sessionId || !message) {
        return reply.status(400).send({ error: 'userId and message are required' });
      }

      const pool = getPool();
      const embeddingService = new EmbeddingService();
      const userService = new UserService(pool);
      const conversationService = new ConversationService(pool);
      const memoryService = new MemoryService(pool);
      const ragService = new RAGService(pool, embeddingService);
      const suggestionService = new SuggestionService();

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const conversationId = await conversationService.findOrCreateConversation(
        internalUserId,
        existingConvId,
        agentType,
      );

      const [memories, history, ragContext] = await Promise.all([
        memoryService.getMemories(internalUserId, agentType),
        conversationService.getHistory(conversationId),
        ragService.buildRagContext(message),
      ]);

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      const sse = (payload: AgentEvent | { type: 'error'; message: string } | { type: 'sources'; sources: Source[] }) =>
        raw.write(`data: ${JSON.stringify(payload)}\n\n`);

      sse({ type: 'conversation_id', conversationId });

      if (ragContext) {
        sse({ type: 'tool_start', tool: 'knowledge_base', input: { query: message } });
        sse({ type: 'tool_end', tool: 'knowledge_base', output: ragContext });
      }

      const historyMessages = history.flatMap(m =>
        m.role === 'user' ? [new HumanMessage(m.content)] : [new AIMessage(m.content)],
      );

      const userContent = ragContext
        ? `Relevant ${agentType} knowledge:\n${ragContext}\n\nUser request: ${message}`
        : message;

      const initialMessages = [...historyMessages, new HumanMessage(userContent)];

      const graph = agentType === 'shopping'
        ? buildShoppingGraph(ragService, memories)
        : buildTravelGraph(memories);

      let assistantText = '';
      const sources: Source[] = [];
      const agentSteps: AgentEvent[] = [];

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const event of graph.streamEvents({ messages: initialMessages } as any, { version: 'v2' })) {
          if (event.event === 'on_chat_model_stream') {
            const text = event.data?.chunk?.content;
            if (typeof text === 'string' && text) {
              assistantText += text;
              const ev: AgentEvent = { type: 'text', content: text };
              sse(ev);
              agentSteps.push(ev);
            }
          }

          if (event.event === 'on_tool_start') {
            const ev: AgentEvent = { type: 'tool_start', tool: event.name as string, input: event.data?.input as unknown };
            sse(ev);
            agentSteps.push(ev);
          }

          if (event.event === 'on_tool_end') {
            const toolName = event.name as string;
            const outputRaw = event.data?.output;
            let output: unknown = outputRaw;
            let error: string | undefined;

            if (outputRaw instanceof ToolMessage) {
              const content = outputRaw.content as string;
              try { output = JSON.parse(content); } catch { output = content; }
              if (outputRaw.status === 'error') {
                error = typeof output === 'string' ? output : JSON.stringify(output);
              }
            }

            const ev: AgentEvent = { type: 'tool_end', tool: toolName, output, error };
            sse(ev);
            agentSteps.push(ev);

            if (toolName === 'web_search' && !error) {
              const data = output as { results?: { title: string; url: string }[] } | null;
              if (data?.results) {
                sources.push(...data.results.map(r => ({ title: r.title, url: r.url })));
              }
            }
          }
        }

        if (sources.length > 0) {
          sse({ type: 'sources', sources });
        }

        const suggestions = await suggestionService.getSuggestions(message, assistantText, agentType);
        if (suggestions.length > 0) {
          const ev: AgentEvent = { type: 'suggestions', suggestions };
          sse(ev);
          agentSteps.push(ev);
        }

        sse({ type: 'done' });
      } catch (err) {
        sse({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        sse({ type: 'done' });
      }

      await conversationService.saveMessage(conversationId, 'user', message);
      await Promise.allSettled([
        conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps),
        memoryService.extractAndSaveMemories(internalUserId, message, agentType),
      ]);

      raw.end();
    },
  );
}

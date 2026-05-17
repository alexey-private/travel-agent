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
 * Same SSE event format as the original backend so the frontend works unchanged:
 *   { type: 'conversation_id', conversationId }
 *   { type: 'text', content }
 *   { type: 'tool_start', tool, input }
 *   { type: 'tool_end', tool, output, error? }
 *   { type: 'sources', sources }
 *   { type: 'suggestions', suggestions }
 *   { type: 'done' }
 *
 * Event mapping from graph.streamEvents() v2:
 *   on_chat_model_stream  → type: 'text'
 *   on_tool_start         → type: 'tool_start'
 *   on_tool_end           → type: 'tool_end'
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
      const ragService = new RAGService(pool, null as never, embeddingService);
      const suggestionService = new SuggestionService();

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const conversationId = await conversationService.findOrCreateConversation(
        internalUserId,
        existingConvId,
      );

      const [memories, history, ragContext] = await Promise.all([
        memoryService.getMemories(internalUserId),
        conversationService.getHistory(conversationId),
        ragService.buildRagContext(message),
      ]);

      // Hijack the response so Fastify doesn't close it automatically
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      const sse = (payload: unknown) => raw.write(`data: ${JSON.stringify(payload)}\n\n`);

      sse({ type: 'conversation_id', conversationId });

      if (ragContext) {
        sse({ type: 'tool_start', tool: 'knowledge_base', input: { query: message } });
        sse({ type: 'tool_end', tool: 'knowledge_base', output: ragContext });
      }

      // Build initial LangGraph message list from stored conversation history.
      // History entries alternate user/assistant — map them to LangChain message types.
      const historyMessages = history.flatMap(m =>
        m.role === 'user'
          ? [new HumanMessage(m.content)]
          : [new AIMessage(m.content)],
      );

      // Prepend RAG context to the current user message when available.
      const userContent = ragContext
        ? `Relevant ${agentType} knowledge:\n${ragContext}\n\nUser request: ${message}`
        : message;

      const initialMessages = [...historyMessages, new HumanMessage(userContent)];

      // Build the graph with per-request system prompt (memories injected).
      const graph = agentType === 'shopping'
        ? buildShoppingGraph(ragService, memories)
        : buildTravelGraph(ragService, memories);

      let assistantText = '';
      const sources: Source[] = [];
      const agentSteps: unknown[] = [];

      try {
        /**
         * graph.streamEvents() yields a stream of granular lifecycle events.
         * Version "v2" provides stable event names across LangGraph releases.
         *
         * Key events we handle:
         *   on_chat_model_stream — a single token chunk from the LLM
         *   on_tool_start        — a tool call is about to execute
         *   on_tool_end          — a tool call completed (with output)
         */
        for await (const event of graph.streamEvents(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            messages: initialMessages,
            userId: internalUserId,
            conversationId,
            agentType,
            memories: memories as any,
            ragContext: ragContext as any,
          } as any,
          { version: 'v2' },
        )) {
          // -- Text streaming: emit each token as it arrives --
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data?.chunk;
            const text = chunk?.content;
            // Debug: log content type to understand Claude's streaming format
            if (text !== undefined && text !== '') {
              console.log('[DEBUG stream]', JSON.stringify({ type: typeof text, isArray: Array.isArray(text), value: text }));
            }
            if (typeof text === 'string' && text) {
              assistantText += text;
              const ev = { type: 'text', content: text };
              sse(ev);
              agentSteps.push(ev);
            }
          }

          // -- Tool start: notify UI before the tool executes --
          if (event.event === 'on_tool_start') {
            const toolName = event.name as string;
            const input = event.data?.input as unknown;
            const ev = { type: 'tool_start', tool: toolName, input };
            sse(ev);
            agentSteps.push(ev);
          }

          // -- Tool end: send result to UI and collect web_search sources --
          if (event.event === 'on_tool_end') {
            const toolName = event.name as string;
            const outputRaw = event.data?.output;

            // ToolMessage.content is always a string (JSON or plain text)
            let output: unknown = outputRaw;
            let error: string | undefined;

            if (outputRaw instanceof ToolMessage) {
              const content = outputRaw.content as string;
              try {
                output = JSON.parse(content);
              } catch {
                output = content;
              }
              if (outputRaw.status === 'error') {
                error = typeof output === 'string' ? output : JSON.stringify(output);
              }
            }

            const ev = { type: 'tool_end', tool: toolName, output, error };
            sse(ev);
            agentSteps.push(ev);

            // Collect web search source URLs for the frontend source panel
            if (toolName === 'web_search' && !error) {
              const data = output as { results?: { title: string; url: string }[] } | null;
              if (data?.results) {
                sources.push(...data.results.map(r => ({ title: r.title, url: r.url })));
              }
            }
          }
        }

        if (sources.length > 0) {
          const ev = { type: 'sources', sources };
          sse(ev);
          agentSteps.push(ev);
        }

        const suggestions = await suggestionService.getSuggestions(message, assistantText, agentType);
        if (suggestions.length > 0) {
          const ev = { type: 'suggestions', suggestions };
          sse(ev);
          agentSteps.push(ev);
        }

        sse({ type: 'done' });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        sse({ type: 'error', message: errMsg });
        sse({ type: 'done' });
      } finally {
        raw.end();
      }

      // Persist conversation after stream ends
      await conversationService.saveMessage(conversationId, 'user', message);
      await Promise.allSettled([
        conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps),
        memoryService.extractAndSaveMemories(internalUserId, message, agentType),
      ]);
    },
  );
}

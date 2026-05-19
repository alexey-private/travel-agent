import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LLMClient } from '../llm/LLMClient';
import { UserService } from '../services/UserService';
import { ConversationService } from '../services/ConversationService';
import { MemoryService } from '../services/MemoryService';
import { RAGService } from '../services/RAGService';
import { TravelAgent } from '../agent/TravelAgent';
import { ShoppingAgent } from '../agent/ShoppingAgent';
import { AgentContext } from '../agent/AgentContext';
import { ToolRegistry } from '../tools/ToolRegistry';
import { SuggestionService } from '../services/SuggestionService';
import { AgentEvent } from '../types/agent';

interface ChatRouteOptions {
  llmClient: LLMClient;
  travelToolRegistry: ToolRegistry;
  shoppingToolRegistry: ToolRegistry;
  userService: UserService;
  conversationService: ConversationService;
  memoryService: MemoryService;
  ragService: RAGService;
  suggestionService: SuggestionService;
}

interface Source {
  title: string;
  url: string;
}

interface ChatBody {
  /** Client-side session ID stored in localStorage */
  userId: string;
  message: string;
  /** Pass to continue an existing conversation */
  conversationId?: string;
  agentType?: 'travel' | 'shopping';
}

/**
 * POST /api/chat
 *
 * Accepts a user message and streams the agent's response as Server-Sent Events.
 *
 * SSE event shapes:
 *   data: {"type":"text","content":"..."}
 *   data: {"type":"tool_start","tool":"web_search","input":{...}}
 *   data: {"type":"tool_end","tool":"web_search","output":{...}}
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 *
 * After the stream ends the route persists the exchange to the DB and
 * triggers memory extraction in the background.
 */
export async function chatRoutes(fastify: FastifyInstance, options: ChatRouteOptions): Promise<void> {
  const { llmClient, travelToolRegistry, shoppingToolRegistry, userService, conversationService, memoryService, ragService, suggestionService } = options;
  fastify.post<{ Body: ChatBody }>(
    '/api/chat',
    async (request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
      const { userId: sessionId, message, conversationId: existingConvId, agentType = 'travel' } = request.body;

      if (!sessionId || !message) {
        return reply.status(400).send({ error: 'userId and message are required' });
      }

      // Resolve/create user and conversation
      const internalUserId = await userService.findOrCreateUser(sessionId);
      const conversationId = await conversationService.findOrCreateConversation(
        internalUserId,
        existingConvId,
        agentType,
      );

      // Load context in parallel
      const [memories, history, ragContext] = await Promise.all([
        memoryService.getMemories(internalUserId, agentType),
        conversationService.getHistory(conversationId),
        ragService.buildRagContext(message),
      ]);

      fastify.log.info({ ragContext: ragContext ? ragContext.slice(0, 200) : null }, 'RAG context result');

      // Hijack the connection so Fastify does not finalise the response.
      // CORS headers must be set manually here because reply.hijack() bypasses
      // the @fastify/cors onSend hook.
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      // Send conversationId immediately so the client can track the session
      raw.write(`data: ${JSON.stringify({ type: 'conversation_id', conversationId })}\n\n`);

      // Show RAG context in the UI so it's visible during demos/testing
      if (ragContext) {
        raw.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'knowledge_base', input: { query: message } })}\n\n`);
        raw.write(`data: ${JSON.stringify({ type: 'tool_end', tool: 'knowledge_base', output: ragContext })}\n\n`);
      }

      // 
      const context = new AgentContext(
        internalUserId,
        conversationId,
        message,
        memories,
        ragContext,
        history,
      );

      const agent = agentType === 'shopping'
        ? new ShoppingAgent(shoppingToolRegistry, llmClient)
        : new TravelAgent(travelToolRegistry, llmClient);
      const agentSteps: AgentEvent[] = [];
      let assistantText = '';
      const sources: Source[] = [];
      // 
      try {
        for await (const event of agent.run(context)) {
          agentSteps.push(event);
          if (event.type === 'text') {
            assistantText += event.content;
          }
          // Collect sources from web_search results
          if (event.type === 'tool_end' && event.tool === 'web_search' && !event.error) {
            const output = event.output as { results?: { title: string; url: string }[] } | null;
            if (output?.results) {
              sources.push(...output.results.map(r => ({ title: r.title, url: r.url })));
            }
          }
          // Delay 'done' until sources and suggestions are emitted
          if (event.type !== 'done') {
            raw.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        }

        // Emit sources
        if (sources.length > 0) {
          raw.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);
        }

        // Emit suggestions
        const suggestions = await suggestionService.getSuggestions(message, assistantText);
        if (suggestions.length > 0) {
          raw.write(`data: ${JSON.stringify({ type: 'suggestions', suggestions })}\n\n`);
          // Store suggestions in agentSteps so they survive conversation reload
          agentSteps.push({ type: 'suggestions', suggestions });
        }

        raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        raw.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
        raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }

      // Persist conversation and memories before closing the stream so that
      // the client's refresh (triggered by 'done') sees the saved data immediately.
      await conversationService.saveMessage(conversationId, 'user', message);
      await Promise.allSettled([
        conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps),
        memoryService.extractAndSaveMemories(internalUserId, message, agentType),
      ]);

      raw.end();
    },
  );
}

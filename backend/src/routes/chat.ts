import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/client';
import { env } from '../config/env';
import { LLMClientFactory } from '../llm/LLMClientFactory';
import { UserService } from '../services/UserService';
import { ConversationService } from '../services/ConversationService';
import { MemoryService } from '../services/MemoryService';
import { RAGService } from '../services/RAGService';
import { EmbeddingService } from '../services/EmbeddingService';
import { TravelAgent } from '../agent/TravelAgent';
import { AgentContext } from '../agent/AgentContext';
import { ToolRegistry } from '../tools/ToolRegistry';
import { WebSearchTool } from '../tools/WebSearchTool';
import { WeatherTool } from '../tools/WeatherTool';
import { CountryInfoTool } from '../tools/CountryInfoTool';
import { CurrencyTool } from '../tools/CurrencyTool';
import { FlightSearchTool } from '../tools/FlightSearchTool';
import { SuggestionService } from '../services/SuggestionService';
import { AgentEvent } from '../types/agent';

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
export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: ChatBody }>(
    '/api/chat',
    async (request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
      const { userId: sessionId, message, conversationId: existingConvId } = request.body;

      if (!sessionId || !message) {
        return reply.status(400).send({ error: 'userId and message are required' });
      }

      const pool = getPool();
      const llmClient = LLMClientFactory.create({
        provider: env.LLM_PROVIDER,
        apiKey: env.ANTHROPIC_API_KEY,
      });

      const userService = new UserService(pool);
      const conversationService = new ConversationService(pool);
      const memoryService = new MemoryService(pool, llmClient);
      const embeddingService = new EmbeddingService();
      const ragService = new RAGService(pool, llmClient, embeddingService);

      // Resolve/create user and conversation
      const internalUserId = await userService.findOrCreateUser(sessionId);
      const conversationId = await conversationService.findOrCreateConversation(
        internalUserId,
        existingConvId,
      );

      // Load context in parallel
      const [memories, history, ragContext] = await Promise.all([
        memoryService.getMemories(internalUserId),
        conversationService.getHistory(conversationId),
        ragService.buildRagContext(message),
      ]);

      const context = new AgentContext(
        internalUserId,
        conversationId,
        message,
        memories,
        ragContext,
        history,
      );

      // Build tool registry
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(new WebSearchTool());
      toolRegistry.register(new WeatherTool());
      toolRegistry.register(new CountryInfoTool());
      toolRegistry.register(new CurrencyTool());
      toolRegistry.register(new FlightSearchTool());

      const agent = new TravelAgent(toolRegistry, llmClient);
      const suggestionService = new SuggestionService(llmClient);

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

      const agentSteps: AgentEvent[] = [];
      let assistantText = '';
      const sources: Source[] = [];

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
      } finally {
        raw.end();
      }

      // Persist conversation — user message first to ensure correct ordering by created_at
      await conversationService.saveMessage(conversationId, 'user', message);
      await Promise.allSettled([
        conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps),
        // Pass only the user's message so the extractor never picks up facts
        // that the assistant inferred (e.g. "flying from Tel Aviv" → home_city).
        memoryService.extractAndSaveMemories(internalUserId, message),
      ]);
    },
  );
}

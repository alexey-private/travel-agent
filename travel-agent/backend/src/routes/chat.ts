import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { getPool } from '../db/client';
import { env } from '../config/env';
import { ConversationService } from '../services/ConversationService';
import { MemoryService } from '../services/MemoryService';
import { RAGService } from '../services/RAGService';
import { EmbeddingService } from '../services/EmbeddingService';
import { TravelAgent } from '../agent/TravelAgent';
import { AgentContext } from '../agent/AgentContext';
import { ToolRegistry } from '../tools/ToolRegistry';
import { WebSearchTool } from '../tools/WebSearchTool';
import { WeatherTool } from '../tools/WeatherTool';
import { AgentEvent } from '../types/agent';

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
      const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      const conversationService = new ConversationService(pool);
      const memoryService = new MemoryService(pool, anthropic);
      const embeddingService = new EmbeddingService();
      const ragService = new RAGService(pool, anthropic, embeddingService);

      // Resolve/create user and conversation
      const internalUserId = await conversationService.findOrCreateUser(sessionId);
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

      const agent = new TravelAgent(toolRegistry, anthropic);

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

      try {
        for await (const event of agent.run(context)) {
          agentSteps.push(event);
          if (event.type === 'text') {
            assistantText += event.content;
          }
          raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        raw.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      } finally {
        raw.end();
      }

      // Persist conversation — user message first to ensure correct ordering by created_at
      const conversationText = `User: ${message}\n\nAssistant: ${assistantText}`;
      await conversationService.saveMessage(conversationId, 'user', message);
      await Promise.allSettled([
        conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps),
        memoryService.extractAndSaveMemories(internalUserId, conversationText),
      ]);
    },
  );
}

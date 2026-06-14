import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HumanMessage, ToolMessage, MessageContentComplex } from '@langchain/core/messages';
import { PDFParse } from 'pdf-parse';
import { UserService } from '../services/UserService';
import { ConversationService } from '../services/ConversationService';
import { MemoryService } from '../services/MemoryService';
import { RAGService } from '../services/RAGService';
import { SuggestionService } from '../services/SuggestionService';
import { historyToMessages } from '../graph/history';
import { AgentEvent } from '../types/agent';
import { LMRound, LMToolCall, LMToolResult } from '../types/lm';
import { UserPreferencesRepository } from '../repositories/UserPreferencesRepository';
import { env } from '../config/env';

interface ChatRouteOptions {
  userService: UserService;
  conversationService: ConversationService;
  memoryService: MemoryService;
  ragService: RAGService;
  suggestionService: SuggestionService;
  prefRepo: UserPreferencesRepository;
}

interface Attachment {
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

interface ChatBody {
  userId: string;
  message: string;
  conversationId?: string;
  agentType?: 'travel' | 'shopping';
  attachments?: Attachment[];
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
export async function chatRoutes(fastify: FastifyInstance, options: ChatRouteOptions): Promise<void> {
  const { userService, conversationService, memoryService, ragService, suggestionService, prefRepo } = options;
  fastify.post<{ Body: ChatBody }>(
    '/api/chat',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: 60_000,
          keyGenerator: (req) => (req.body as ChatBody | null)?.userId ?? req.ip ?? 'unknown',
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
      const { userId: sessionId, message, conversationId: existingConvId, agentType = 'travel', attachments } = request.body;

      if (!sessionId || (!message && !(attachments && attachments.length > 0))) {
        return reply.status(400).send({ error: 'userId and message (or attachment) are required' });
      }

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const conversationId = await conversationService.findOrCreateConversation(
        internalUserId,
        existingConvId,
        agentType,
      );

      const [memories, history, ragContext, userPrefs] = await Promise.all([
        memoryService.getMemories(internalUserId, agentType),
        conversationService.getHistory(conversationId),
        ragService.buildRagContext(message),
        prefRepo.get(internalUserId),
      ]);

      const requestId = request.id;
      request.log.info({ requestId, conversationId, agentType, ragHit: ragContext !== null }, 'chat request started');

      // P0-2: persist user message before stream so history survives mid-stream crashes
      await conversationService.saveMessage(conversationId, 'user', message, undefined, undefined, internalUserId, agentType);

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? request.headers.origin ?? '*',
        'Access-Control-Allow-Credentials': 'true',
        'X-Request-Id': requestId,
      });

      const sse = (payload: AgentEvent | { type: 'error'; message: string } | { type: 'sources'; sources: Source[] }) =>
        raw.write(`data: ${JSON.stringify(payload)}\n\n`);

      sse({ type: 'conversation_id', conversationId });

      const historyMessages = historyToMessages(history);

      const userContent = message || 'Please analyze the attached file(s).';

      const humanMsg = await (async () => {
        if (!attachments || attachments.length === 0) return new HumanMessage(userContent);
        // Build multimodal content: text first, then binary attachments
        const content: MessageContentComplex[] = [{ type: 'text', text: userContent }];
        for (const att of attachments) {
          if (att.mimeType.startsWith('image/')) {
            content.push({ type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.base64}` } });
          } else if (att.mimeType === 'application/pdf' && env.LLM_PROVIDER === 'anthropic') {
            // Anthropic natively supports PDF documents via the pdfs-2024-09-25 beta header.
            content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.base64 } });
          } else if (att.mimeType === 'application/pdf') {
            // OpenAI doesn't support the 'document' content type — extract text server-side instead.
            const buf = Buffer.from(att.base64, 'base64');
            const parsed = await new PDFParse({ data: buf }).getText();
            content.push({ type: 'text', text: `[PDF: ${att.name}]\n${parsed.text}` });
          }
        }
        return new HumanMessage({ content });
      })();

      const initialMessages = [...historyMessages, humanMsg];

      const taskListName = agentType === 'shopping' ? userPrefs.shoppingTaskListName : userPrefs.taskListName;
      const graph = agentType === 'shopping' ? fastify.shoppingGraph : fastify.travelGraph;

      // P0-3: abort the graph when the client disconnects to stop wasting LLM tokens
      // P2-14: also abort after GRAPH_TIMEOUT_MS to prevent zombie streams on slow APIs
      const ac = new AbortController();
      let timedOut = false;
      request.raw.once('close', () => ac.abort());
      const timeoutId = setTimeout(() => { timedOut = true; ac.abort(); }, 60_000);

      let assistantText = '';
      const sources: Source[] = [];
      const agentSteps: AgentEvent[] = [];

      // LM message sequence for history reconstruction (AIMessage+ToolMessage rounds)
      const lmRounds: LMRound[] = [];
      let currentToolCalls: LMToolCall[] = [];
      let currentToolResults: LMToolResult[] = [];
      const flushLMRound = () => {
        if (currentToolCalls.length > 0) {
          lmRounds.push({ tool_calls: currentToolCalls, tool_results: currentToolResults });
          currentToolCalls = [];
          currentToolResults = [];
        }
      };

      try {
        for await (const event of graph.streamEvents({ messages: initialMessages, userId: internalUserId, sessionId, conversationId, agentType, memories, taskListName, ragContext }, { version: 'v2', signal: ac.signal })) {
          if (event.event === 'on_chat_model_stream') {
            const chunkContent = event.data?.chunk?.content;
            // Anthropic returns content as array [{type:'text', text:'...'}], OpenAI as string
            const text = typeof chunkContent === 'string'
              ? chunkContent
              : Array.isArray(chunkContent)
                ? chunkContent.filter((b: {type: string}) => b.type === 'text').map((b: {text: string}) => b.text).join('')
                : '';
            if (text) {
              assistantText += text;
              const ev: AgentEvent = { type: 'text', content: text };
              sse(ev);
              agentSteps.push(ev);
            }
          }

          if (event.event === 'on_chat_model_end') {
            // Capture tool_calls emitted by the LLM for LM-message history reconstruction.
            // Uses duck-typing (not instanceof) because streaming returns AIMessageChunk.
            type ToolCallShape = { id?: string; name: string; args: Record<string, unknown> };
            const output = event.data?.output as { tool_calls?: ToolCallShape[] } | null | undefined;
            const toolCalls = Array.isArray(output?.tool_calls) ? output.tool_calls : [];
            if (toolCalls.length > 0) {
              flushLMRound(); // flush previous round if any (multi-round ReAct)
              currentToolCalls = toolCalls.map(tc => ({ id: tc.id ?? '', name: tc.name, args: tc.args }));
            } else {
              flushLMRound(); // flush last round before the final text response
            }
          }

          if (event.event === 'on_tool_start') {
            const ev: AgentEvent = { type: 'tool_start', tool: event.name, input: event.data?.input as unknown };
            sse(ev);
            agentSteps.push(ev);
          }

          if (event.event === 'on_tool_end') {
            const toolName = event.name;
            const outputRaw = event.data?.output;
            let output: unknown = outputRaw;
            let error: string | undefined;

            if (outputRaw instanceof ToolMessage) {
              const rawContent = typeof outputRaw.content === 'string'
                ? outputRaw.content
                : JSON.stringify(outputRaw.content);
              try { output = JSON.parse(rawContent); } catch { output = rawContent; }
              if (outputRaw.status === 'error') {
                error = typeof output === 'string' ? output : JSON.stringify(output);
              }
              if (outputRaw.tool_call_id) {
                currentToolResults.push({ tool_call_id: outputRaw.tool_call_id, name: toolName, content: rawContent });
              }
            } else if (typeof outputRaw === 'string' && outputRaw.startsWith('Error:')) {
              // wrapTool returns "Error: ..." string on failure (throwing would suppress on_tool_end)
              error = outputRaw;
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

        flushLMRound(); // safety flush if stream ended without a final on_chat_model_end
        sse({ type: 'done' }); // client can render response immediately; suggestions follow async

        const suggestions = await suggestionService.getSuggestions(message, assistantText, agentType);
        if (suggestions.length > 0) {
          const ev: AgentEvent = { type: 'suggestions', suggestions };
          sse(ev);
          agentSteps.push(ev);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          if (timedOut) {
            request.log.warn({ requestId }, 'graph execution timed out');
            sse({ type: 'error', message: 'Request timed out' });
            sse({ type: 'done' });
          }
          // else: client disconnected — silent
        } else {
          request.log.error({ requestId, err }, 'agent error');
          sse({ type: 'error', message: err instanceof Error ? err.message : String(err) });
          sse({ type: 'done' });
        }
      } finally {
        clearTimeout(timeoutId);
        // P0-4: always close the SSE stream regardless of success, error, or disconnect
        raw.end();
      }

      await Promise.allSettled([
        (assistantText || lmRounds.length > 0)
          ? conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps, lmRounds, internalUserId, agentType)
          : Promise.resolve(),
        memoryService.extractAndSaveMemories(internalUserId, message, agentType),
      ]);
      request.log.info({ requestId, conversationId }, 'chat request completed');
    },
  );
}

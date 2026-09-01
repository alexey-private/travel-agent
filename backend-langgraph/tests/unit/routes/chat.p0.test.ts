/**
 * Unit tests for chat route — P0 correctness guarantees.
 *
 * All external dependencies (DB services, LLM models, graph) are fully mocked
 * so these tests run without a database or network.
 *
 * Covers:
 *   P0-2  User message is saved BEFORE the stream starts
 *   P0-3  AbortError (client disconnect) does NOT emit an SSE error event
 *   P0-4  SSE stream is always closed (raw.end) even when post-stream DB writes fail
 *
 * The suite also covers the CORS headers of the hijacked stream: the route
 * writes its own headers on the raw socket, so it is the one place where the
 * plugin's decision can be lost or contradicted.
 */

import Fastify, { FastifyInstance, FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import { allowedOrigins } from '@/security/cors';
import { ModelAbortError } from '@langchain/core/errors';
import { chatRoutes } from '@/routes/chat';
import type { UserService } from '@/services/UserService';
import type { ConversationService } from '@/services/ConversationService';
import type { MemoryService } from '@/services/MemoryService';
import type { RAGService } from '@/services/RAGService';
import type { SuggestionService } from '@/services/SuggestionService';
import type { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';

// ── Global mocks ──────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    TAVILY_API_KEY: 'test-tavily',
    OPENWEATHER_API_KEY: 'test-weather',
    PORT: 3000,
    NODE_ENV: 'test',
    REASONING_MODEL: 'claude-sonnet-4-6',
    FAST_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

jest.mock('@langchain/anthropic', () => ({ ChatAnthropic: jest.fn() }));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));

const mockTravelStreamEvents = jest.fn();
const mockShoppingStreamEvents = jest.fn();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function* emitText(text: string) {
  yield { event: 'on_chat_model_stream', name: 'ChatAnthropic', data: { chunk: { content: text } } };
}

function parseSse(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice('data: '.length)) as Record<string, unknown>);
}

/** The single front end this test deployment serves. */
const ALLOWED_ORIGIN = 'https://app.example.com';

interface ServiceOverrides {
  saveMessage?: jest.Mock;
  streamEvents?: jest.Mock;
  extractAndSaveMemories?: jest.Mock;
  storedLanguage?: string;
  logger?: SpyLogger;
}

/**
 * A logger whose `error` and `warn` are spies, so a test can ask what the
 * server recorded and not only what it put on the wire. The distinction is the
 * whole point of the abort handling: a client that leaves mid-answer must
 * produce neither.
 *
 * `child()` returns the same object, so `request.log` writes to the same spies
 * the test holds.
 */
type SpyLogger = { error: jest.Mock; warn: jest.Mock } & Record<string, unknown>;

function spyLogger(): SpyLogger {
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    silent: jest.fn(),
    level: 'info',
  } as unknown as SpyLogger;
  logger.child = () => logger;
  return logger;
}

async function buildApp(overrides: ServiceOverrides = {}): Promise<FastifyInstance> {
  const saveMessage = overrides.saveMessage ?? jest.fn().mockResolvedValue(undefined);
  const streamEvents = overrides.streamEvents ?? jest.fn().mockImplementation(() => emitText('ok'));

  mockTravelStreamEvents.mockImplementation(streamEvents);
  mockShoppingStreamEvents.mockImplementation(streamEvents);

  const app = overrides.logger
    ? Fastify({ loggerInstance: overrides.logger as unknown as FastifyBaseLogger })
    : Fastify({ logger: false });

  // Registered the way index.ts does it, so the stream's headers are produced by
  // the same allowlist a deploy uses rather than by the test.
  await app.register(cors, {
    origin: allowedOrigins(ALLOWED_ORIGIN, true),
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Inject compiled graphs via Fastify DI (mirrors how index.ts wires them at startup)
  app.decorate('travelGraph', { streamEvents: mockTravelStreamEvents });
  app.decorate('shoppingGraph', { streamEvents: mockShoppingStreamEvents });

  const userService = {
    findOrCreateUser: jest.fn().mockResolvedValue('internal-user-uuid'),
  } as unknown as UserService;

  const conversationService = {
    findOrCreateConversation: jest.fn().mockResolvedValue('conv-uuid'),
    getHistory: jest.fn().mockResolvedValue([]),
    saveMessage,
  } as unknown as ConversationService;

  const memoryService = {
    getMemories: jest.fn().mockResolvedValue([]),
    extractAndSaveMemories:
      overrides.extractAndSaveMemories ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as MemoryService;

  const ragService = {
    buildRagContext: jest.fn().mockResolvedValue(null),
  } as unknown as RAGService;

  const suggestionService = {
    getSuggestions: jest.fn().mockResolvedValue([]),
  } as unknown as SuggestionService;

  const prefRepo = {
    get: jest.fn().mockResolvedValue({
      taskListName: 'Travel Plans',
      shoppingTaskListName: 'Shopping',
      language: overrides.storedLanguage,
    }),
  } as unknown as UserPreferencesRepository;

  await app.register(chatRoutes, {
    userService,
    conversationService,
    memoryService,
    ragService,
    suggestionService,
    prefRepo,
  });

  return app;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('POST /api/chat — P0 correctness', () => {
  afterEach(async () => {
    jest.clearAllMocks();
  });

  // ── P0-2: save user message before stream ─────────────────────────────────

  describe('P0-2: user message saved before stream starts', () => {
    it('saveMessage(user) is called before streamEvents is invoked', async () => {
      const callOrder: string[] = [];

      const saveMessage = jest.fn().mockImplementation(async (_convId, role) => {
        callOrder.push(`save:${role}`);
      });

      const streamEvents = jest.fn().mockImplementation(async function* () {
        callOrder.push('stream:start');
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'hi' } } };
      });

      const app = await buildApp({ saveMessage, streamEvents });

      await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Plan a trip' },
      });

      await app.close();

      const userSaveIndex = callOrder.indexOf('save:user');
      const streamStartIndex = callOrder.indexOf('stream:start');

      expect(userSaveIndex).toBeGreaterThanOrEqual(0);
      expect(streamStartIndex).toBeGreaterThanOrEqual(0);
      expect(userSaveIndex).toBeLessThan(streamStartIndex);
    });

    it('user message is saved even when the graph throws mid-stream', async () => {
      const saveMessage = jest.fn().mockResolvedValue(undefined);

      const streamEvents = jest.fn().mockImplementation(async function* () {
        throw new Error('Graph crashed');
        // eslint-disable-next-line no-unreachable
        yield;
      });

      const app = await buildApp({ saveMessage, streamEvents });

      await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Find hotels' },
      });

      await app.close();

      const userSave = saveMessage.mock.calls.find(([, role]) => role === 'user');
      expect(userSave).toBeDefined();
      expect(userSave![2]).toBe('Find hotels');
    });
  });

  // ── P0-3: AbortError on client disconnect ────────────────────────────────

  describe('P0-3: client disconnect (AbortError) is handled silently', () => {
    it('does NOT emit an SSE error event when stream is aborted', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
        // eslint-disable-next-line no-unreachable
        yield;
      });

      const app = await buildApp({ streamEvents });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const events = parseSse(response.body);
      expect(events.some((e) => e.type === 'error')).toBe(false);
    });

    it('emits a regular error event for non-AbortErrors', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        throw new Error('Upstream API failed');
        // eslint-disable-next-line no-unreachable
        yield;
      });

      const app = await buildApp({ streamEvents });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const events = parseSse(response.body);
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });

    /**
     * The thrown message is written by a model provider, a database driver or a
     * tool, for whoever runs the server. It used to go straight onto the wire,
     * where the Telegram bot read it out to the user verbatim.
     */
    it('names the failure with a code and puts no thrown text on the wire', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        throw new Error('ECONNREFUSED 10.0.0.4:5432 — password authentication failed for user "prod"');
        // eslint-disable-next-line no-unreachable
        yield;
      });

      const app = await buildApp({ streamEvents });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const error = parseSse(response.body).find((e) => e.type === 'error');
      expect(error).toEqual({ type: 'error', code: 'agent_failed' });
      expect(response.body).not.toContain('ECONNREFUSED');
      expect(response.body).not.toContain('password authentication');
    });

    it('passes an AbortSignal to graph.streamEvents', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'hi' } } };
      });

      const app = await buildApp({ streamEvents });

      await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const [, options] = streamEvents.mock.calls[0];
      expect(options).toHaveProperty('signal');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  // ── T5: the abort is recognised however it surfaces ──────────────────────

  /**
   * `err.name === 'AbortError'` was the whole test, and it does not recognise
   * the `ModelAbortError` LangChain throws when the signal fires inside a model
   * call — which is what a real client disconnect produces most of the time.
   * The result was the loudest possible reaction to the quietest possible
   * event: an error-level log line naming an agent failure, plus an SSE error
   * written to a socket that had already gone.
   *
   * `isAbort` is the same question asked once, in
   * [providerFallback.ts](backend-langgraph/src/llm/providerFallback.ts), where
   * the fallback engine already has to answer it — a second copy here would be
   * a second place for the next abort shape to be missed.
   */
  describe('T5: a client disconnect is recognised however the abort surfaces', () => {
    it('stays silent when the abort surfaces as a ModelAbortError', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        throw new ModelAbortError('Aborted');
        // eslint-disable-next-line no-unreachable
        yield;
      });
      const logger = spyLogger();

      const app = await buildApp({ streamEvents, logger });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const events = parseSse(response.body);
      expect(events.some((e) => e.type === 'error')).toBe(false);
      // Nobody is left to read it, and nothing went wrong.
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('still records a real failure at error level', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        throw new Error('Upstream API failed');
        // eslint-disable-next-line no-unreachable
        yield;
      });
      const logger = spyLogger();

      const app = await buildApp({ streamEvents, logger });

      await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      // The counterpart to the test above: widening what counts as an abort
      // must not have swallowed the failures that do deserve a line.
      expect(logger.error).toHaveBeenCalled();
    });

    /**
     * The other half of the same `if`, and the half nobody was watching: a
     * timeout aborts the very same controller a disconnect does, so the only
     * thing separating "say nothing" from "tell the user the request expired"
     * is the `timedOut` flag. The branch had no test before this one — which
     * meant the change above could have silenced the timeout too and every
     * suite would still have been green.
     */
    it('still tells the user when the graph runs out of its 60 s budget', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* (
        _input: unknown,
        options: { signal: AbortSignal },
      ) {
        // Hang until the route's own timer gives up, then fail the way a model
        // call aborted mid-flight does.
        await new Promise<void>((resolve) => options.signal.addEventListener('abort', () => resolve()));
        throw new ModelAbortError('Aborted');
        // eslint-disable-next-line no-unreachable
        yield;
      });
      const logger = spyLogger();

      const app = await buildApp({ streamEvents, logger });

      jest.useFakeTimers();
      try {
        const pending = app.inject({
          method: 'POST',
          url: '/api/chat',
          payload: { userId: 'u1', message: 'Hello' },
        });

        await jest.advanceTimersByTimeAsync(61_000);
        const response = await pending;

        const events = parseSse(response.body);
        expect(events).toContainEqual({ type: 'error', code: 'request_timed_out' });
        // Expected slowness, not a failure — so a warning, and no error line.
        expect(logger.warn).toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        await app.close();
      }
    });
  });

  // ── P0-4: SSE stream always closed ───────────────────────────────────────

  describe('P0-4: done event always sent and stream always closed', () => {
    it('emits done as the last event on success', async () => {
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const events = parseSse(response.body);
      expect(events[events.length - 1].type).toBe('done');
    });

    it('emits done as the last event even when graph throws', async () => {
      const streamEvents = jest.fn().mockImplementation(async function* () {
        throw new Error('LLM quota exceeded');
        // eslint-disable-next-line no-unreachable
        yield;
      });

      const app = await buildApp({ streamEvents });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      const events = parseSse(response.body);
      expect(events[events.length - 1].type).toBe('done');
    });

    it('response is complete (status 200) even when post-stream DB write fails', async () => {
      const saveMessage = jest.fn()
        .mockResolvedValueOnce(undefined)    // user message save — succeeds (P0-2)
        .mockRejectedValue(new Error('DB connection lost'));  // assistant save — fails

      const app = await buildApp({ saveMessage });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { userId: 'u1', message: 'Hello' },
      });

      await app.close();

      // Server responded with 200 and a valid SSE payload despite the DB error
      expect(response.statusCode).toBe(200);
      const events = parseSse(response.body);
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });
  });

  // ── CORS on a hijacked stream ─────────────────────────────────────────────

  describe('the stream is readable only by an allowed origin', () => {
    /** The CORS headers the raw stream comes back with for `origin`. */
    async function streamHeaders(origin: string): Promise<Record<string, unknown>> {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { origin },
        payload: { userId: 'u1', message: 'Hello' },
      });
      await app.close();
      return response.headers as Record<string, unknown>;
    }

    it('carries the answer the plugin already gave across the hijack', async () => {
      const headers = await streamHeaders(ALLOWED_ORIGIN);
      expect(headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('tells an unknown origin nothing, rather than reflecting it back', async () => {
      // The bug this replaces: with no allowlist configured, the route echoed
      // whatever `Origin` it was sent, so any page could read a user's stream.
      const headers = await streamHeaders('https://evil.example');
      expect(headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never allows credentials', async () => {
      const headers = await streamHeaders(ALLOWED_ORIGIN);
      expect(headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  // ── Memory extraction follows the message, not the setting ─────────────────

  describe('memory extraction language', () => {
    const extractLanguage = async (storedLanguage: string, message: string): Promise<string> => {
      const extractAndSaveMemories = jest.fn().mockResolvedValue(undefined);
      const app = await buildApp({ storedLanguage, extractAndSaveMemories });

      await app.inject({ method: 'POST', url: '/api/chat', payload: { userId: 'u1', message } });
      await app.close();

      expect(extractAndSaveMemories).toHaveBeenCalledTimes(1);
      return extractAndSaveMemories.mock.calls[0][3] as string;
    };

    /**
     * The extraction prompt tells the model "The user writes in X" about the very
     * message it is reading, so X has to come from that message. Passing the
     * stored setting made the sentence false for exactly the user the whole
     * language design exists for: one configured in Hebrew who asks in English.
     */
    it('uses the language of the message, not the stored setting', async () => {
      expect(await extractLanguage('he', 'I live in Tel Aviv and I am vegetarian.')).toBe('en');
    });

    it('still uses the message when the two agree', async () => {
      expect(await extractLanguage('he', 'אני גר בתל אביב ואני צמחוני')).toBe('he');
    });

    it('falls back to the setting for a message with no letters at all', async () => {
      expect(await extractLanguage('ru', '397 €')).toBe('ru');
    });
  });
});

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { getPool, closePool } from './db/client';
import { EmbeddingService } from './services/EmbeddingService';
import { UserService } from './services/UserService';
import { ConversationService } from './services/ConversationService';
import { MemoryService } from './services/MemoryService';
import { RAGService } from './services/RAGService';
import { SuggestionService } from './services/SuggestionService';
import { chatRoutes } from './routes/chat';
import { memoryRoutes } from './routes/memory';
import { conversationRoutes } from './routes/conversations';
import { authRoutes } from './routes/auth';
import { settingsRoutes } from './routes/settings';
import { calendarRoutes } from './routes/calendar';
import { exportRoutes } from './routes/export';
import { transcribeRoutes } from './routes/transcribe';
import { GoogleTokenRepository } from './repositories/GoogleTokenRepository';
import { ICloudTokenRepository } from './repositories/ICloudTokenRepository';
import { UserPreferencesRepository } from './repositories/UserPreferencesRepository';
import { GoogleCalendarProvider } from './tools/providers/GoogleCalendarProvider';
import { GoogleTasksProvider } from './tools/providers/GoogleTasksProvider';
import { MockCalendarProvider } from './tools/providers/MockCalendarProvider';
import { MockTasksProvider } from './tools/providers/MockTasksProvider';
import { ICloudCalendarProvider } from './tools/providers/ICloudCalendarProvider';
import { ICloudRemindersProvider } from './tools/providers/ICloudRemindersProvider';
import { UserAwareCalendarProvider } from './tools/providers/UserAwareCalendarProvider';
import { UserAwareTasksProvider } from './tools/providers/UserAwareTasksProvider';
import { createTravelGraph } from './graph/travelGraph';
import { createShoppingGraph } from './graph/shoppingGraph';

let _reqCounter = 0;

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport:
      env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  genReqId: () => `req-${(++_reqCounter).toString().padStart(6, '0')}`,
  requestIdHeader: 'x-request-id',
  bodyLimit: 25 * 1024 * 1024, // 25 MB — accommodate base64-encoded file attachments
});

async function bootstrap(): Promise<void> {
  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGIN ?? true,
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  // global: false — only routes that set config.rateLimit are limited.
  // hook: 'preHandler' — body is parsed at this stage, so keyGenerator can read req.body.userId.
  await fastify.register(rateLimit, { global: false, hook: 'preHandler' });

  // Shared singletons — created once at startup, reused across all requests
  const pool = getPool();
  const embeddingService = new EmbeddingService();
  const userService = new UserService(pool);
  const conversationService = new ConversationService(pool, embeddingService);
  const memoryService = new MemoryService(pool);
  const ragService = new RAGService(pool, embeddingService);
  const suggestionService = new SuggestionService();

  const tokenRepo = new GoogleTokenRepository(pool);
  const icloudTokenRepo = new ICloudTokenRepository(pool, env.ENCRYPTION_KEY ?? 'default-dev-key-change-in-prod!!');
  const prefRepo = new UserPreferencesRepository(pool);

  const googleConfig = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI }
    : undefined;

  const googleCalendarProvider = googleConfig
    ? new GoogleCalendarProvider(tokenRepo, googleConfig.clientId, googleConfig.clientSecret, googleConfig.redirectUri)
    : new MockCalendarProvider();
  const googleTasksProvider = googleConfig
    ? new GoogleTasksProvider(tokenRepo, googleConfig.clientId, googleConfig.clientSecret, googleConfig.redirectUri)
    : new MockTasksProvider();

  const icloudCalendarProvider = new ICloudCalendarProvider(icloudTokenRepo, prefRepo);
  const icloudRemindersProvider = new ICloudRemindersProvider(icloudTokenRepo, prefRepo);

  const calendarProvider = new UserAwareCalendarProvider(googleCalendarProvider, icloudCalendarProvider, prefRepo);
  const tasksProvider = new UserAwareTasksProvider(googleTasksProvider, icloudRemindersProvider, prefRepo);

  // Compile both agent graphs once — reused across all requests via fastify.decorate.
  fastify.decorate('travelGraph', createTravelGraph(calendarProvider, tasksProvider, conversationService));
  fastify.decorate('shoppingGraph', createShoppingGraph(ragService, calendarProvider, tasksProvider, conversationService));
  fastify.log.info('Agent graphs initialised');

  await fastify.register(chatRoutes, { userService, conversationService, memoryService, ragService, suggestionService, prefRepo });
  await fastify.register(memoryRoutes);
  await fastify.register(conversationRoutes);
  if (googleConfig) {
    await fastify.register(authRoutes, {
      tokenRepo,
      userService,
      clientId: googleConfig.clientId,
      clientSecret: googleConfig.clientSecret,
      redirectUri: googleConfig.redirectUri,
    });
    fastify.log.info('Google Calendar OAuth2 routes registered');
  }

  await fastify.register(settingsRoutes, {
    icloudTokenRepo,
    prefRepo,
    googleTokenRepo: tokenRepo,
    userService,
  });
  fastify.log.info('Settings routes registered');

  await fastify.register(calendarRoutes, { calendarProvider, tasksProvider });
  fastify.log.info('Calendar routes registered');

  await fastify.register(exportRoutes);
  await fastify.register(transcribeRoutes);

  fastify.get('/health', async () => ({ status: 'ok', engine: 'langgraph' }));
  await pool.query('SELECT 1');
  fastify.log.info('Database connection verified');

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  fastify.log.info(`[LangGraph backend] listening on port ${env.PORT}`);
}

async function shutdown(): Promise<void> {
  fastify.log.info('Shutting down...');
  await fastify.close();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

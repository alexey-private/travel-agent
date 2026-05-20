import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import { GoogleTokenRepository } from './repositories/GoogleTokenRepository';
import { GoogleCalendarProvider } from './tools/providers/GoogleCalendarProvider';
import { CalendarProvider } from './tools/providers/CalendarProvider';
import { GoogleTasksProvider } from './tools/providers/GoogleTasksProvider';
import { TasksProvider } from './tools/providers/TasksProvider';

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
});

async function bootstrap(): Promise<void> {
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Shared singletons — created once at startup, reused across all requests
  const pool = getPool();
  const embeddingService = new EmbeddingService();
  const userService = new UserService(pool);
  const conversationService = new ConversationService(pool);
  const memoryService = new MemoryService(pool);
  const ragService = new RAGService(pool, embeddingService);
  const suggestionService = new SuggestionService();

  const tokenRepo = new GoogleTokenRepository(pool);
  const googleConfig = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI }
    : undefined;
  const calendarProvider: CalendarProvider | undefined = googleConfig
    ? new GoogleCalendarProvider(tokenRepo, googleConfig.clientId, googleConfig.clientSecret, googleConfig.redirectUri)
    : undefined;
  const tasksProvider: TasksProvider | undefined = googleConfig
    ? new GoogleTasksProvider(tokenRepo, googleConfig.clientId, googleConfig.clientSecret, googleConfig.redirectUri)
    : undefined;

  await fastify.register(chatRoutes, { userService, conversationService, memoryService, ragService, suggestionService, calendarProvider, tasksProvider });
  await fastify.register(memoryRoutes);
  await fastify.register(conversationRoutes);
  if (googleConfig) {
    await fastify.register(authRoutes, {
      tokenRepo,
      clientId: googleConfig.clientId,
      clientSecret: googleConfig.clientSecret,
      redirectUri: googleConfig.redirectUri,
    });
    fastify.log.info('Google Calendar OAuth2 routes registered');
  }

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

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

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport:
      env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
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

  await fastify.register(chatRoutes, { userService, conversationService, memoryService, ragService, suggestionService });
  await fastify.register(memoryRoutes);
  await fastify.register(conversationRoutes);

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

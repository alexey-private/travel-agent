import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { getPool, closePool } from './db/client';
import { chatRoutes } from './routes/chat';
import { memoryRoutes } from './routes/memory';
import { conversationRoutes } from './routes/conversations';
import { LLMClientFactory } from './llm/LLMClientFactory';
import { EmbeddingService } from './services/EmbeddingService';
import { ToolRegistry } from './tools/ToolRegistry';
import { WebSearchTool } from './tools/WebSearchTool';
import { WeatherTool } from './tools/WeatherTool';
import { CountryInfoTool } from './tools/CountryInfoTool';
import { CurrencyTool } from './tools/CurrencyTool';
import { FlightSearchTool } from './tools/FlightSearchTool';

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
  // CORS — allow the Next.js dev server and any configured frontend origin
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Shared singletons — created once at startup, reused across all requests
  const apiKey = env.LLM_PROVIDER === 'openai'
    ? env.OPENAI_API_KEY ?? (() => { throw new Error('OPENAI_API_KEY is required'); })()
    : env.ANTHROPIC_API_KEY ?? (() => { throw new Error('ANTHROPIC_API_KEY is required'); })();

  const llmClient = LLMClientFactory.create({ provider: env.LLM_PROVIDER, apiKey });
  const embeddingService = new EmbeddingService();

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new WeatherTool());
  toolRegistry.register(new CountryInfoTool());
  toolRegistry.register(new CurrencyTool());
  toolRegistry.register(new FlightSearchTool());

  // Routes
  await fastify.register(chatRoutes, { llmClient, toolRegistry, embeddingService });
  await fastify.register(memoryRoutes);
  await fastify.register(conversationRoutes);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Verify DB connectivity before accepting traffic
  const pool = getPool();
  await pool.query('SELECT 1');
  fastify.log.info('Database connection verified');

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  fastify.log.info(`Server listening on port ${env.PORT}`);
}

// Graceful shutdown
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

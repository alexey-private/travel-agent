import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { getPool, closePool } from './db/client';
import { RAGService } from './services/RAGService';
import { UserService } from './services/UserService';
import { ConversationService } from './services/ConversationService';
import { MemoryService } from './services/MemoryService';
import { SuggestionService } from './services/SuggestionService';
import { chatRoutes } from './routes/chat';
import { memoryRoutes } from './routes/memory';
import { conversationRoutes } from './routes/conversations';
import { LLMClientFactory } from './llm/LLMClientFactory';
import { EmbeddingService } from './services/EmbeddingService';
import { ToolRegistry } from './tools/ToolRegistry';
import { WebSearchTool } from './tools/WebSearchTool';
import { CurrencyTool } from './tools/CurrencyTool';
import { WeatherTool } from './tools/travel/WeatherTool';
import { CountryInfoTool } from './tools/travel/CountryInfoTool';
import { FlightSearchTool } from './tools/travel/FlightSearchTool';
import { ProductSearchTool } from './tools/shopping/ProductSearchTool';
import { PriceCompareTool } from './tools/shopping/PriceCompareTool';
import { ProductReviewsTool } from './tools/shopping/ProductReviewsTool';
import { DealSearchTool } from './tools/shopping/DealSearchTool';

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
  // CORS — allow the Next.js dev server and any configured frontend origin
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Shared singletons — created once at startup, reused across all requests
  const apiKey = env.LLM_PROVIDER === 'openai'
    ? env.OPENAI_API_KEY ?? (() => { throw new Error('OPENAI_API_KEY is required'); })()
    : env.ANTHROPIC_API_KEY ?? (() => { throw new Error('ANTHROPIC_API_KEY is required'); })();
  //
  const llmClient = LLMClientFactory.create({ provider: env.LLM_PROVIDER, apiKey });
  const embeddingService = new EmbeddingService();
  const pool = getPool();
  const ragService = new RAGService(pool, llmClient, embeddingService);
  const userService = new UserService(pool);
  const conversationService = new ConversationService(pool);
  const memoryService = new MemoryService(pool, llmClient);
  const suggestionService = new SuggestionService(llmClient);

  const webSearchTool = new WebSearchTool();
  const currencyTool = new CurrencyTool();

  const travelToolRegistry = new ToolRegistry();
  travelToolRegistry.register(webSearchTool);
  travelToolRegistry.register(new WeatherTool());
  travelToolRegistry.register(new CountryInfoTool());
  travelToolRegistry.register(currencyTool);
  travelToolRegistry.register(new FlightSearchTool());

  const shoppingToolRegistry = new ToolRegistry();
  shoppingToolRegistry.register(new ProductSearchTool(ragService));
  shoppingToolRegistry.register(new PriceCompareTool());
  shoppingToolRegistry.register(new ProductReviewsTool(ragService));
  shoppingToolRegistry.register(new DealSearchTool());
  shoppingToolRegistry.register(currencyTool);
  shoppingToolRegistry.register(webSearchTool);

  // Routes
  await fastify.register(chatRoutes, {
    llmClient, travelToolRegistry, shoppingToolRegistry,
    userService, conversationService, memoryService, ragService, suggestionService,
  });
  await fastify.register(memoryRoutes);
  await fastify.register(conversationRoutes);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Verify DB connectivity before accepting traffic
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

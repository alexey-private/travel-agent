import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import { authRoutes } from './routes/auth';
import { settingsRoutes } from './routes/settings';
import { calendarRoutes } from './routes/calendar';
import { exportRoutes } from './routes/export';
import { transcribeRoutes } from './routes/transcribe';
import { userRoutes } from './routes/users';
import { pushRoutes } from './routes/push';
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
import { TasksTool } from './tools/TasksTool';
import { LLMClientFactory } from './llm/LLMClientFactory';
import { EmbeddingService } from './services/EmbeddingService';
import { ToolRegistry } from './tools/ToolRegistry';
import { WebSearchTool } from './tools/WebSearchTool';
import { CurrencyTool } from './tools/CurrencyTool';
import { CalendarTool } from './tools/CalendarTool';
import { WeatherTool } from './tools/travel/WeatherTool';
import { CountryInfoTool } from './tools/travel/CountryInfoTool';
import { FlightSearchTool } from './tools/travel/FlightSearchTool';
import { HotelSearchTool } from './tools/travel/HotelSearchTool';
import { VisaRequirementsTool } from './tools/travel/VisaRequirementsTool';
import { CarRentalTool } from './tools/travel/CarRentalTool';
import { TourSearchTool } from './tools/travel/TourSearchTool';
import { SpaSearchTool } from './tools/travel/SpaSearchTool';
import { ProductSearchTool } from './tools/shopping/ProductSearchTool';
import { PriceCompareTool } from './tools/shopping/PriceCompareTool';
import { ProductReviewsTool } from './tools/shopping/ProductReviewsTool';
import { DealSearchTool } from './tools/shopping/DealSearchTool';
import { WishlistTool } from './tools/shopping/WishlistTool';
import { PriceAlertTool } from './tools/shopping/PriceAlertTool';
import { SearchConversationsTool } from './tools/SearchConversationsTool';

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
  await fastify.register(rateLimit, { global: false, hook: 'preHandler' });

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
  const conversationService = new ConversationService(pool, embeddingService);
  const memoryService = new MemoryService(pool, llmClient);
  const suggestionService = new SuggestionService(llmClient);

  const webSearchTool = new WebSearchTool();
  const currencyTool = new CurrencyTool();

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

  const calendarTool = new CalendarTool(calendarProvider);
  const travelTasksTool = new TasksTool(tasksProvider, 'Travel Plans');
  const shoppingTasksTool = new TasksTool(tasksProvider);

  const travelToolRegistry = new ToolRegistry();
  travelToolRegistry.register(webSearchTool);
  travelToolRegistry.register(new WeatherTool());
  travelToolRegistry.register(new CountryInfoTool());
  travelToolRegistry.register(currencyTool);
  travelToolRegistry.register(new FlightSearchTool());
  travelToolRegistry.register(new HotelSearchTool());
  travelToolRegistry.register(new VisaRequirementsTool());
  travelToolRegistry.register(new CarRentalTool());
  travelToolRegistry.register(new TourSearchTool());
  travelToolRegistry.register(new SpaSearchTool());
  travelToolRegistry.register(calendarTool);
  travelToolRegistry.register(travelTasksTool);
  travelToolRegistry.register(new SearchConversationsTool(conversationService));

  const shoppingToolRegistry = new ToolRegistry();
  shoppingToolRegistry.register(new ProductSearchTool(ragService));
  shoppingToolRegistry.register(new PriceCompareTool());
  shoppingToolRegistry.register(new ProductReviewsTool(ragService));
  shoppingToolRegistry.register(new DealSearchTool());
  shoppingToolRegistry.register(currencyTool);
  shoppingToolRegistry.register(webSearchTool);
  shoppingToolRegistry.register(new WishlistTool());
  shoppingToolRegistry.register(new PriceAlertTool());
  shoppingToolRegistry.register(calendarTool);
  shoppingToolRegistry.register(shoppingTasksTool);
  shoppingToolRegistry.register(new SearchConversationsTool(conversationService));

  // Routes
  await fastify.register(chatRoutes, {
    llmClient, travelToolRegistry, shoppingToolRegistry,
    userService, conversationService, memoryService, ragService, suggestionService, prefRepo,
  });
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
  await fastify.register(userRoutes);
  await fastify.register(pushRoutes, { pool, userService });

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

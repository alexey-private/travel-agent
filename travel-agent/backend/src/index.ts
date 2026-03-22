import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { getPool, closePool } from './db/client';
import { chatRoutes } from './routes/chat';
import { memoryRoutes } from './routes/memory';

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

  // Routes
  await fastify.register(chatRoutes);
  await fastify.register(memoryRoutes);

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

import { FastifyInstance } from 'fastify';
import { getPool } from '../db/client';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Returns all Telegram session IDs (tg-<numericId>) for the notification cron job.
  fastify.get('/api/users/telegram', async (_req, reply) => {
    const pool = getPool();
    const result = await pool.query<{ session_id: string }>(
      `SELECT session_id FROM users WHERE session_id LIKE 'tg-%' AND session_id NOT LIKE 'tg-anon-%'`,
    );
    return reply.send({ sessionIds: result.rows.map((r) => r.session_id) });
  });
}

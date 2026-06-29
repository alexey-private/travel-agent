import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { UserService } from '../services/UserService';

interface PushRouteOptions {
  pool: Pool;
  userService: UserService;
}

interface SubscribeBody {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface UnsubscribeBody {
  userId: string;
  endpoint: string;
}

export async function pushRoutes(fastify: FastifyInstance, opts: PushRouteOptions): Promise<void> {
  const { pool, userService } = opts;

  // POST /api/push/subscribe
  fastify.post<{ Body: SubscribeBody }>('/api/push/subscribe', async (req, reply) => {
    const { userId, endpoint, keys } = req.body;
    if (!userId || !endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.code(400).send({ error: 'userId, endpoint, keys.p256dh and keys.auth are required' });
    }

    const internalId = await userService.findOrCreateUser(userId);

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [internalId, endpoint, keys.p256dh, keys.auth],
    );

    return reply.code(201).send({ ok: true });
  });

  // DELETE /api/push/unsubscribe
  fastify.delete<{ Body: UnsubscribeBody }>('/api/push/unsubscribe', async (req, reply) => {
    const { userId, endpoint } = req.body;
    if (!userId || !endpoint) {
      return reply.code(400).send({ error: 'userId and endpoint are required' });
    }

    const internalId = await userService.findOrCreateUser(userId);

    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [internalId, endpoint],
    );

    return reply.send({ ok: true });
  });

  // GET /api/push/vapid-public-key
  fastify.get('/api/push/vapid-public-key', async (_req, reply) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return reply.code(503).send({ error: 'VAPID not configured' });
    return { publicKey: key };
  });
}

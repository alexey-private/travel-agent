/**
 * Unit tests for /api/users routes.
 * Mocks the DB pool returned by getPool().
 */

import Fastify, { FastifyInstance } from 'fastify';
import { userRoutes } from '@/routes/users';

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({
  getPool: () => ({ query: mockQuery }),
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(userRoutes);
  return app;
}

describe('GET /api/users/telegram', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns session IDs for telegram users', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ session_id: 'tg-123456' }, { session_id: 'tg-789012' }],
    });

    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      sessionIds: ['tg-123456', 'tg-789012'],
    });

    await app.close();
  });

  it('returns empty array when there are no telegram users', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ sessionIds: [] });

    await app.close();
  });

  it('queries only tg- prefixed, non-anonymous session IDs', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/api/users/telegram' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIKE 'tg-%'"),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT LIKE 'tg-anon-%'"),
    );

    await app.close();
  });
});

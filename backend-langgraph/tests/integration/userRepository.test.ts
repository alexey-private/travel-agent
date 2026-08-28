/**
 * Integration tests for UserRepository.findOrCreateUser.
 *
 * The frontend fires several requests in parallel on first load
 * (/api/conversations, /api/memory, /api/settings), all of which resolve the
 * same brand-new session_id. A plain SELECT-then-INSERT lets two of them race
 * into a duplicate key violation on users_session_id_key, surfacing as a 500.
 */

import { Pool } from 'pg';
import { UserRepository } from '@/repositories/UserRepository';
import { closePool } from '@/db/client';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5432/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

const CONCURRENCY = 8;

/**
 * pg.Pool opens connections lazily, so a bare Promise.all serialises the first
 * callers onto a single connection and they never overlap. Pre-opening the
 * connections is what lets every caller run its SELECT before the first INSERT
 * lands - without this the race under test simply does not reproduce.
 */
async function warmUpPool(pool: Pool, size: number): Promise<void> {
  const clients = await Promise.all(Array.from({ length: size }, () => pool.connect()));
  clients.forEach((client) => client.release());
}

describe('UserRepository.findOrCreateUser (integration)', () => {
  let repo: UserRepository;

  beforeAll(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await setupTestDb();
  });

  afterAll(async () => {
    await closePool();
    if (process.env.TEST_DB_AVAILABLE === 'true') await teardownTestDb();
  });

  beforeEach(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await clearTestDb();
    repo = new UserRepository(getTestPool());
  });

  itDb('creates a user on first call and reuses it afterwards', async () => {
    const first = await repo.findOrCreateUser('web-session-single');
    const second = await repo.findOrCreateUser('web-session-single');

    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
  });

  itDb('returns one shared id for concurrent callers of the same session', async () => {
    const sessionId = 'web-session-concurrent';
    await warmUpPool(getTestPool(), CONCURRENCY);

    const ids = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => repo.findOrCreateUser(sessionId)),
    );

    expect(new Set(ids).size).toBe(1);

    const { rows } = await getTestPool().query(
      'SELECT id FROM users WHERE session_id = $1',
      [sessionId],
    );
    expect(rows).toHaveLength(1);
    expect(ids[0]).toBe(rows[0].id);
  });

  itDb('keeps distinct sessions on separate users under concurrency', async () => {
    const sessions = ['web-a', 'web-b', 'web-c'];
    await warmUpPool(getTestPool(), CONCURRENCY);

    const ids = await Promise.all(
      sessions.flatMap((s) => [repo.findOrCreateUser(s), repo.findOrCreateUser(s)]),
    );

    expect(new Set(ids).size).toBe(sessions.length);
  });
});

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://user:password@localhost:5432/travel_agent_test';

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, allowExitOnIdle: true });
  }
  return pool;
}

export async function setupTestDb(): Promise<void> {
  const p = getTestPool();
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await p.query(sql);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== '42710' && code !== '42P07' && code !== '23505') {
        throw err;
      }
    }
  }
}

export async function clearTestDb(): Promise<void> {
  const p = getTestPool();
  await p.query('DELETE FROM messages');
  await p.query('DELETE FROM user_memories');
  await p.query('DELETE FROM conversations');
  await p.query('DELETE FROM user_service_preferences');
  await p.query('DELETE FROM users');
  await p.query('DELETE FROM knowledge_base');
}

export async function teardownTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

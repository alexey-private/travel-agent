/**
 * Test database helpers.
 * Provides setup, teardown, and cleanup utilities for integration tests.
 * Connects to the test database (postgres_test on port 5433).
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://user:password@localhost:5433/travel_agent_test';

let pool: Pool | null = null;

/**
 * Returns the shared test pool, creating it on first call.
 */
export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
  }
  return pool;
}

/**
 * Runs all SQL migration files against the test database.
 * Migrations use IF NOT EXISTS guards so they are safe to run multiple times.
 * Duplicate-object errors (race conditions when test files run in parallel) are ignored.
 */
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
      // Ignore errors that result from concurrent test files racing to create
      // the same objects (extensions, tables, indexes):
      //   42710 = duplicate_object   (CREATE EXTENSION already exists)
      //   42P07 = duplicate_table    (CREATE TABLE already exists — should not
      //                               happen with IF NOT EXISTS, but be safe)
      //   23505 = unique_violation   (pg_extension catalog race condition)
      const code = (err as { code?: string }).code;
      if (code !== '42710' && code !== '42P07' && code !== '23505') {
        throw err;
      }
    }
  }
}

/**
 * Deletes all rows from every application table.
 * Call before each test to start with a clean state.
 */
export async function clearTestDb(): Promise<void> {
  const p = getTestPool();
  // Delete in dependency order to satisfy FK constraints
  await p.query('DELETE FROM messages');
  await p.query('DELETE FROM user_memories');
  await p.query('DELETE FROM conversations');
  await p.query('DELETE FROM users');
  await p.query('DELETE FROM knowledge_base');
}

/**
 * Closes the test pool.
 * Call once in afterAll to release DB connections.
 */
export async function teardownTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

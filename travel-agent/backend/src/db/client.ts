import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Singleton PostgreSQL connection pool.
 * Reused across the entire application lifetime.
 */
let pool: Pool | null = null;

/**
 * Returns the shared pg Pool instance, creating it on first call.
 *
 * @returns {Pool} The shared connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString =
      env.NODE_ENV === 'test' && env.TEST_DATABASE_URL
        ? env.TEST_DATABASE_URL
        : env.DATABASE_URL;

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  return pool;
}

/**
 * Closes the pool. Should be called on graceful shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Migration runner.
 * Reads all *.sql files from the migrations directory in lexicographic order
 * and executes them against the database. Tracks applied migrations in a
 * dedicated `schema_migrations` table to ensure idempotency.
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY id',
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function applyMigration(pool: Pool, filename: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`  Applied: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function run(): Promise<void> {
  console.log('Running migrations...');

  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  Skipped: ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await applyMigration(pool, file, sql);
    count++;
  }

  console.log(`Migrations complete. ${count} new migration(s) applied.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  pool.end().finally(() => process.exit(1));
});

/**
 * One-time backfill: generate and store embeddings for all existing messages
 * that don't yet have an entry in conversation_embeddings.
 *
 * Runs sequentially (1 message at a time) with exponential backoff on 429.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

import { getPool, closePool } from './client';
import { EmbeddingService } from '../services/EmbeddingService';

const INITIAL_DELAY_MS = 2000;
const MAX_RETRIES = 5;

async function embedWithRetry(embedder: EmbeddingService, content: string): Promise<number[]> {
  let delay = INITIAL_DELAY_MS;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await embedder.embed(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') && attempt < MAX_RETRIES) {
        console.log(`  429 rate limit — waiting ${delay}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

async function main() {
  const pool = getPool();
  const embedder = new EmbeddingService();

  const { rows } = await pool.query<{
    id: string; conversation_id: string; role: string; content: string;
    user_id: string; agent_type: string;
  }>(`
    SELECT m.id, m.conversation_id, m.role, m.content,
           c.user_id::text, c.agent_type
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.content != ''
      AND NOT EXISTS (
        SELECT 1 FROM conversation_embeddings ce WHERE ce.message_id = m.id
      )
    ORDER BY m.created_at ASC
  `);

  console.log(`Backfilling ${rows.length} messages (sequential, with retry)...`);
  let done = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const embedding = await embedWithRetry(embedder, row.content);
      await pool.query(
        `INSERT INTO conversation_embeddings (message_id, user_id, agent_type, role, embedding)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [row.id, row.user_id, row.agent_type, row.role, JSON.stringify(embedding)],
      );
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${rows.length}`);
      // Small pause between each request to stay under rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      failed++;
      console.error(`Failed message ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Backfill complete: ${done} saved, ${failed} failed.`);
  await closePool();
}

main().catch(err => { console.error(err); process.exit(1); });

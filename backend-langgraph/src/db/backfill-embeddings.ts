/**
 * One-time backfill: generate and store embeddings for all existing messages
 * that don't yet have an entry in conversation_embeddings.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

import { getPool, closePool } from './client';
import { EmbeddingService } from '../services/EmbeddingService';

const BATCH = 5;
const BATCH_DELAY_MS = 1500;

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

  console.log(`Backfilling ${rows.length} messages...`);
  let done = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (row) => {
      try {
        const embedding = await embedder.embed(row.content);
        await pool.query(
          `INSERT INTO conversation_embeddings (message_id, user_id, agent_type, role, embedding)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [row.id, row.user_id, row.agent_type, row.role, JSON.stringify(embedding)],
        );
        done++;
      } catch (err) {
        console.error(`Failed to embed message ${row.id}:`, err);
      }
    }));
    console.log(`  ${done}/${rows.length}`);
    if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log('Backfill complete.');
  await closePool();
}

main().catch(err => { console.error(err); process.exit(1); });

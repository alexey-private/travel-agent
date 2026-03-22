import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { UserMemory } from '../types/memory';

/**
 * Repository for user long-term memory (key-value preferences).
 */
export class MemoryRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Inserts or updates a memory entry for the given user.
   * Uses ON CONFLICT to perform an upsert on (user_id, key).
   */
  async upsertMemory(userId: string, key: string, value: string): Promise<void> {
    await this.execute(
      `INSERT INTO user_memories (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, key, value],
    );
  }

  /**
   * Returns all memory entries for the given user.
   */
  async getMemories(userId: string): Promise<UserMemory[]> {
    return this.query<UserMemory>(
      'SELECT key, value FROM user_memories WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId],
    );
  }

  /**
   * Deletes a specific memory entry by key.
   */
  async deleteMemory(userId: string, key: string): Promise<void> {
    await this.execute(
      'DELETE FROM user_memories WHERE user_id = $1 AND key = $2',
      [userId, key],
    );
  }
}

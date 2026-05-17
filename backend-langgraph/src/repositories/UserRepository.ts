import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';

interface UserRow {
  id: string;
}

/**
 * Repository for user-related persistence operations.
 */
export class UserRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Finds an existing user by sessionId or creates a new one.
   * @returns The user's UUID
   */
  async findOrCreateUser(sessionId: string): Promise<string> {
    const existing = await this.queryOne<UserRow>(
      'SELECT id FROM users WHERE session_id = $1',
      [sessionId],
    );
    if (existing) return existing.id;

    const created = await this.queryOne<UserRow>(
      'INSERT INTO users (session_id) VALUES ($1) RETURNING id',
      [sessionId],
    );
    return created!.id;
  }

  /**
   * Returns true if the conversation belongs to the given user.
   */
  async verifyOwnership(userId: string, conversationId: string): Promise<boolean> {
    const row = await this.queryOne<{ id: string }>(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    return row !== null;
  }
}

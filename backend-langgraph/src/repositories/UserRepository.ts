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
   *
   * The INSERT upserts on purpose: the frontend fires several requests in
   * parallel on first load, and a plain SELECT-then-INSERT lets two of them
   * race into a duplicate key violation on users_session_id_key.
   *
   * The preceding SELECT is kept as a fast path: it is not what closes the
   * race, but it keeps the common case (an existing user) off the upsert,
   * which would otherwise rewrite the row on every call.
   *
   * @returns The user's UUID
   */
  async findOrCreateUser(sessionId: string): Promise<string> {
    const existing = await this.queryOne<UserRow>(
      'SELECT id FROM users WHERE session_id = $1',
      [sessionId],
    );
    if (existing) return existing.id;

    const created = await this.queryOne<UserRow>(
      `INSERT INTO users (session_id) VALUES ($1)
       ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
       RETURNING id`,
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

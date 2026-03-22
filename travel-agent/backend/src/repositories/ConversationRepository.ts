import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';

interface UserRow {
  id: string;
}

interface ConversationRow {
  id: string;
}

interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Repository for users, conversations, and messages.
 */
export class ConversationRepository extends BaseRepository {
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
   * Finds an existing conversation by id, or creates a new one for the user.
   * @returns The conversation's UUID
   */
  async findOrCreateConversation(userId: string, conversationId?: string): Promise<string> {
    if (conversationId) {
      const existing = await this.queryOne<ConversationRow>(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId],
      );
      if (existing) return existing.id;
    }

    const created = await this.queryOne<ConversationRow>(
      'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
      [userId],
    );
    return created!.id;
  }

  /**
   * Returns the message history for a conversation, ordered chronologically.
   */
  async getHistory(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    return this.query<MessageRow>(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
  }

  /**
   * Saves a single message to the conversation.
   */
  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    agentSteps?: unknown,
  ): Promise<void> {
    await this.execute(
      'INSERT INTO messages (conversation_id, role, content, agent_steps) VALUES ($1, $2, $3, $4)',
      [conversationId, role, content, agentSteps ? JSON.stringify(agentSteps) : null],
    );
  }
}

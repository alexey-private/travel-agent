import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';

interface ConversationRow {
  id: string;
}

interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
  agent_steps: unknown[] | null;
}

interface ConversationListRow {
  id: string;
  created_at: string;
  title: string | null;
}

/**
 * Repository for conversations and messages.
 */
export class ConversationRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
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
  async getHistory(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string; agent_steps: unknown[] | null }>> {
    return this.query<MessageRow>(
      'SELECT role, content, agent_steps FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
  }

  /**
   * Lists all conversations for a user, newest first.
   * Returns the first user message as the conversation title.
   */
  async listConversations(
    userId: string,
  ): Promise<Array<{ id: string; created_at: string; title: string | null }>> {
    return this.query<ConversationListRow>(
      `SELECT
        c.id,
        c.created_at,
        (
          SELECT content FROM messages
          WHERE conversation_id = c.id AND role = 'user'
          ORDER BY created_at ASC LIMIT 1
        ) AS title
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId],
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

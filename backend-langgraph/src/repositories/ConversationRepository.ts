import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { LMRound } from '../types/lm';

interface ConversationRow {
  id: string;
}

interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
  agent_steps: unknown[] | null;
  lm_messages: LMRound[] | null;
  created_at: string;
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
  async findOrCreateConversation(userId: string, conversationId?: string, agentType: 'travel' | 'shopping' = 'travel'): Promise<string> {
    if (conversationId) {
      const existing = await this.queryOne<ConversationRow>(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId],
      );
      if (existing) return existing.id;
    }

    const created = await this.queryOne<ConversationRow>(
      'INSERT INTO conversations (user_id, agent_type) VALUES ($1, $2) RETURNING id',
      [userId, agentType],
    );
    return created!.id;
  }

  /**
   * Returns the message history for a conversation, ordered chronologically.
   */
  async getHistory(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string; agent_steps: unknown[] | null; lm_messages: LMRound[] | null; created_at: string }>> {
    return this.query<MessageRow>(
      `SELECT role, content, agent_steps, lm_messages, created_at FROM (
         SELECT role, content, agent_steps, lm_messages, created_at
         FROM messages WHERE conversation_id = $1
         ORDER BY created_at DESC LIMIT 20
       ) sub ORDER BY created_at ASC`,
      [conversationId],
    );
  }

  /**
   * Lists all conversations for a user, newest first.
   * Returns the first user message as the conversation title.
   */
  async listConversations(
    userId: string,
    agentType: 'travel' | 'shopping' = 'travel',
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
       WHERE c.user_id = $1 AND c.agent_type = $2
       ORDER BY c.created_at DESC`,
      [userId, agentType],
    );
  }

  /**
   * Full-text search across all messages for a user.
   * Returns up to `limit` matching excerpts grouped by conversation.
   */
  async saveEmbedding(
    messageId: string,
    userId: string,
    agentType: string,
    role: string,
    embedding: number[],
  ): Promise<void> {
    await this.execute(
      `INSERT INTO conversation_embeddings (message_id, user_id, agent_type, role, embedding)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (message_id) DO NOTHING`,
      [messageId, userId, agentType, role, JSON.stringify(embedding)],
    );
  }

  async searchConversations(
    userId: string,
    queryEmbedding: number[],
    agentType: 'travel' | 'shopping' = 'travel',
    limit = 5,
  ): Promise<Array<{ conversationId: string; date: string; role: string; excerpt: string }>> {
    const rows = await this.query<{ conversationId: string; date: string; role: string; excerpt: string }>(
      `SELECT
         m.conversation_id AS "conversationId",
         to_char(m.created_at, 'YYYY-MM-DD') AS date,
         ce.role,
         left(m.content, 400) AS excerpt
       FROM conversation_embeddings ce
       JOIN messages m ON m.id = ce.message_id
       WHERE ce.user_id = $1
         AND ce.agent_type = $2
         AND m.content != ''
       ORDER BY ce.embedding <=> $3
       LIMIT $4`,
      [userId, agentType, JSON.stringify(queryEmbedding), limit],
    );
    return rows;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.execute('DELETE FROM conversations WHERE id = $1', [conversationId]);
  }

  async clearMessages(conversationId: string): Promise<void> {
    await this.execute('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
  }

  /**
   * Saves a single message to the conversation.
   */
  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    agentSteps?: unknown,
    lmMessages?: LMRound[],
  ): Promise<string> {
    const row = await this.queryOne<{ id: string }>(
      'INSERT INTO messages (conversation_id, role, content, agent_steps, lm_messages) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        conversationId,
        role,
        content,
        agentSteps ? JSON.stringify(agentSteps) : null,
        lmMessages && lmMessages.length > 0 ? JSON.stringify(lmMessages) : null,
      ],
    );
    return row!.id;
  }
}

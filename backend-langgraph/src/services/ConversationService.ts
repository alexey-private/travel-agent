import { Pool } from 'pg';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { LMRound } from '../types/lm';

/**
 * Service layer for conversation lifecycle management.
 * Delegates persistence to ConversationRepository.
 */
export class ConversationService {
  private repo: ConversationRepository;

  constructor(pool: Pool) {
    this.repo = new ConversationRepository(pool);
  }

  /**
   * Finds or creates a conversation for the user.
   * Pass an existing conversationId to continue a prior session.
   * @returns The conversation UUID (new or existing)
   */
  async findOrCreateConversation(userId: string, conversationId?: string, agentType: 'travel' | 'shopping' = 'travel'): Promise<string> {
    return this.repo.findOrCreateConversation(userId, conversationId, agentType);
  }

  /**
   * Returns the ordered message history for a conversation.
   */
  async getHistory(
    conversationId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; agent_steps: unknown[] | null; lm_messages: LMRound[] | null }>> {
    return this.repo.getHistory(conversationId);
  }

  /**
   * Lists all conversations for a user, newest first.
   */
  async listConversations(
    userId: string,
    agentType: 'travel' | 'shopping' = 'travel',
  ): Promise<Array<{ id: string; created_at: string; title: string | null }>> {
    return this.repo.listConversations(userId, agentType);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.repo.deleteConversation(conversationId);
  }

  async clearMessages(conversationId: string): Promise<void> {
    return this.repo.clearMessages(conversationId);
  }

  /**
   * Persists a user or assistant message to the database.
   */
  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    agentSteps?: unknown,
    lmMessages?: LMRound[],
  ): Promise<void> {
    return this.repo.saveMessage(conversationId, role, content, agentSteps, lmMessages);
  }
}

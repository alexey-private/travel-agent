import { Pool } from 'pg';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { EmbeddingService } from './EmbeddingService';
import { LMRound } from '../types/lm';

/**
 * Service layer for conversation lifecycle management.
 * Delegates persistence to ConversationRepository.
 */
export class ConversationService {
  private repo: ConversationRepository;
  private embeddingService: EmbeddingService;

  constructor(pool: Pool, embeddingService?: EmbeddingService) {
    this.repo = new ConversationRepository(pool);
    this.embeddingService = embeddingService ?? new EmbeddingService();
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

  async searchConversations(
    userId: string,
    query: string,
    agentType: 'travel' | 'shopping' = 'travel',
    limit = 5,
  ): Promise<Array<{ conversationId: string; date: string; role: string; excerpt: string }>> {
    const queryEmbedding = await this.embeddingService.embed(query);
    return this.repo.searchConversations(userId, queryEmbedding, agentType, limit);
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
    userId?: string,
    agentType?: string,
  ): Promise<void> {
    const messageId = await this.repo.saveMessage(conversationId, role, content, agentSteps, lmMessages);
    // Embed non-empty messages asynchronously — never block the response
    if (content && userId && agentType) {
      this.embeddingService.embed(content).then(embedding =>
        this.repo.saveEmbedding(messageId, userId, agentType, role, embedding)
      ).catch(() => { /* embedding failure is non-fatal */ });
    }
  }
}

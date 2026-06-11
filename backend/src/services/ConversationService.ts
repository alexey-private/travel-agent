import { Pool } from 'pg';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { EmbeddingService } from './EmbeddingService';

export class ConversationService {
  private repo: ConversationRepository;
  private embeddingService: EmbeddingService;

  constructor(pool: Pool, embeddingService?: EmbeddingService) {
    this.repo = new ConversationRepository(pool);
    this.embeddingService = embeddingService ?? new EmbeddingService();
  }

  async findOrCreateConversation(userId: string, conversationId?: string, agentType: 'travel' | 'shopping' = 'travel'): Promise<string> {
    return this.repo.findOrCreateConversation(userId, conversationId, agentType);
  }

  async getHistory(
    conversationId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; agent_steps: unknown[] | null }>> {
    return this.repo.getHistory(conversationId);
  }

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

  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    agentSteps?: unknown,
    _lmMessages?: unknown,
    userId?: string,
    agentType?: string,
  ): Promise<void> {
    const messageId = await this.repo.saveMessage(conversationId, role, content, agentSteps);
    if (content && userId && agentType) {
      this.embeddingService.embed(content).then(embedding =>
        this.repo.saveEmbedding(messageId, userId, agentType, role, embedding)
      ).catch(() => { /* non-fatal */ });
    }
  }
}

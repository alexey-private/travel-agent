import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { KnowledgeRepository } from '../repositories/KnowledgeRepository';
import { EmbeddingService } from './EmbeddingService';
import { KnowledgeChunk } from '../types/memory';

const SHOULD_QUERY_PROMPT = `You decide whether a travel-planning query needs factual destination knowledge
from a knowledge base (visa rules, health tips, cultural guides, etc.).

Answer with a single word: yes or no.`;

/**
 * Service for Retrieval-Augmented Generation over the knowledge base.
 *
 * Responsibilities:
 * - Deciding (via Claude) whether a query warrants a KB lookup
 * - Embedding queries and retrieving similar chunks
 * - Ingesting new documents into the knowledge base
 */
export class RAGService {
  private knowledgeRepo: KnowledgeRepository;
  private embeddingService: EmbeddingService;
  private anthropic: Anthropic;

  constructor(pool: Pool, anthropic: Anthropic, embeddingService: EmbeddingService) {
    this.knowledgeRepo = new KnowledgeRepository(pool);
    this.embeddingService = embeddingService;
    this.anthropic = anthropic;
  }

  /**
   * Asks Claude whether the given user query needs a knowledge base lookup.
   * Returns true when Claude responds with "yes".
   */
  async shouldQueryKnowledgeBase(query: string): Promise<boolean> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: SHOULD_QUERY_PROMPT,
        messages: [{ role: 'user', content: query }],
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('')
        .toLowerCase()
        .trim();

      return text.startsWith('yes');
    } catch {
      // Default to true on error so RAG is not silently skipped
      return true;
    }
  }

  /**
   * Embeds the query and retrieves the top-K most similar knowledge chunks.
   *
   * @param query - The user's message or a semantic query derived from it
   * @param topK - Number of chunks to retrieve (default: 3)
   */
  async retrieve(query: string, topK = 3): Promise<KnowledgeChunk[]> {
    const embedding = await this.embeddingService.embed(query);
    return this.knowledgeRepo.findSimilar(embedding, topK);
  }

  /**
   * Embeds and stores a new document in the knowledge base.
   *
   * @param topic - Short descriptive label (e.g. "Tokyo visa requirements")
   * @param content - Full text of the document
   * @param metadata - Optional JSON metadata to store alongside the document
   */
  async ingestDocument(
    topic: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const embedding = await this.embeddingService.embed(content);
    await this.knowledgeRepo.insert(topic, content, embedding, metadata);
  }

  /**
   * Convenience method used by the chat route:
   * checks whether RAG is needed, retrieves chunks, and formats them as a
   * single context string suitable for prepending to the system prompt.
   *
   * Returns null if RAG is not needed or no results found.
   */
  async buildRagContext(query: string): Promise<string | null> {
    const needed = await this.shouldQueryKnowledgeBase(query);
    if (!needed) return null;

    const chunks = await this.retrieve(query);
    if (chunks.length === 0) return null;

    return chunks
      .map(c => `[${c.topic}]\n${c.content}`)
      .join('\n\n---\n\n');
  }
}

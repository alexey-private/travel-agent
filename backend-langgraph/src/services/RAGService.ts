import { Pool } from 'pg';
import LRU from 'lru-cache';
import { KnowledgeRepository } from '../repositories/KnowledgeRepository';
import { EmbeddingService } from './EmbeddingService';
import { KnowledgeChunk } from '../types/memory';

const RAG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RAG_CACHE_MAX = 512;
const MIN_SIMILARITY = 0.65;

/**
 * Service for Retrieval-Augmented Generation over the knowledge base.
 *
 * Responsibilities:
 * - Retrieving semantically similar knowledge chunks via vector search
 * - Deciding whether chunks are relevant enough (similarity ≥ MIN_SIMILARITY)
 * - Ingesting new documents into the knowledge base
 */
export class RAGService {
  private knowledgeRepo: KnowledgeRepository;
  private embeddingService: EmbeddingService;
  private ragContextCache = new LRU<string, string | null>({ max: RAG_CACHE_MAX, maxAge: RAG_CACHE_TTL_MS });

  constructor(pool: Pool, embeddingService: EmbeddingService) {
    this.knowledgeRepo = new KnowledgeRepository(pool);
    this.embeddingService = embeddingService;
  }

  /**
   * Embeds the query and retrieves the top-K most similar knowledge chunks.
   *
   * @param query - The user's message or a semantic query derived from it
   * @param topK - Number of chunks to retrieve (default: 3)
   */
  async retrieve(
    query: string,
    topK = 3,
    filter?: Record<string, unknown>,
  ): Promise<KnowledgeChunk[]> {
    const embedding = await this.embeddingService.embed(query);
    return this.knowledgeRepo.findSimilar(embedding, topK, filter);
  }

  /**
   * Embeds and stores a new document in the knowledge base.
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
   * Retrieves knowledge chunks and returns them as a formatted context string
   * when at least one chunk has similarity ≥ MIN_SIMILARITY.
   * Returns null when the KB has nothing relevant to add.
   */
  async buildRagContext(query: string): Promise<string | null> {
    const cached = this.ragContextCache.get(query);
    if (cached !== undefined) return cached;

    let chunks;
    try {
      chunks = await this.retrieve(query);
    } catch {
      return null;
    }
    const relevant = chunks.filter(c => c.similarity >= MIN_SIMILARITY);
    const result = relevant.length === 0
      ? null
      : relevant.map(c => `[${c.topic}]\n${c.content}`).join('\n\n---\n\n');

    this.ragContextCache.set(query, result);
    return result;
  }
}

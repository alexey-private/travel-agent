import { Pool } from 'pg';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { KnowledgeRepository } from '../repositories/KnowledgeRepository';
import { EmbeddingService } from './EmbeddingService';
import { KnowledgeChunk } from '../types/memory';
import { createModel } from '../llm/createModel';

const RAG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const SHOULD_QUERY_PROMPT = `You decide whether a travel-planning query needs factual destination knowledge
from a knowledge base (visa rules, health tips, cultural guides, etc.).

Answer with a single word: yes or no.`;

/**
 * Service for Retrieval-Augmented Generation over the knowledge base.
 *
 * Responsibilities:
 * - Deciding (via LLM) whether a query warrants a KB lookup
 * - Embedding queries and retrieving similar chunks
 * - Ingesting new documents into the knowledge base
 */
export class RAGService {
  private knowledgeRepo: KnowledgeRepository;
  private embeddingService: EmbeddingService;
  private shouldQueryCache = new Map<string, CacheEntry<boolean>>();
  private ragContextCache = new Map<string, CacheEntry<string | null>>();

  constructor(pool: Pool, embeddingService: EmbeddingService) {
    this.knowledgeRepo = new KnowledgeRepository(pool);
    this.embeddingService = embeddingService;
  }

  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.set(key, { value, expiresAt: Date.now() + RAG_CACHE_TTL_MS });
  }

  /**
   * Asks the LLM whether the given user query needs a knowledge base lookup.
   * Returns true when the model responds with "yes".
   */
  async shouldQueryKnowledgeBase(query: string): Promise<boolean> {
    const cached = this.getCached(this.shouldQueryCache, query);
    if (cached !== undefined) return cached;

    try {
      const response = await createModel('fast', 10).invoke([
        new SystemMessage(SHOULD_QUERY_PROMPT),
        new HumanMessage(query),
      ]);

      const text = typeof response.content === 'string' ? response.content : '';
      const result = text.toLowerCase().trim().startsWith('yes');
      this.setCached(this.shouldQueryCache, query, result);
      return result;
    } catch {
      return true;
    }
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
    const chunks = await this.knowledgeRepo.findSimilar(embedding, topK, filter);
    return chunks;
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
    const cached = this.getCached(this.ragContextCache, query);
    if (cached !== undefined) return cached;

    const needed = await this.shouldQueryKnowledgeBase(query);
    if (!needed) {
      this.setCached(this.ragContextCache, query, null);
      return null;
    }

    const chunks = await this.retrieve(query);
    const result = chunks.length === 0
      ? null
      : chunks.map(c => `[${c.topic}]\n${c.content}`).join('\n\n---\n\n');

    this.setCached(this.ragContextCache, query, result);
    return result;
  }
}

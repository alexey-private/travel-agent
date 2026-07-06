import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { KnowledgeChunk } from '../types/memory';

interface KnowledgeRow {
  topic: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Repository for the pgvector knowledge base.
 * Supports similarity search and document ingestion.
 */
export class KnowledgeRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Finds the most similar knowledge chunks to the given embedding vector
   * using cosine distance (<=>).
   *
   * @param embedding - The query embedding as a float array
   * @param topK - Maximum number of results to return
   * @returns Knowledge chunks ordered by descending similarity
   */
  async findSimilar(
    embedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<KnowledgeChunk[]> {
    const vectorLiteral = `[${embedding.join(',')}]`;

    return this.withClient(async (client) => {
      await client.query('SET ivfflat.probes = 10');

      let query: string;
      let params: unknown[];

      if (filter) {
        query = `SELECT topic, content, metadata, 1 - (embedding <=> $1::vector) AS similarity
                 FROM knowledge_base
                 WHERE metadata @> $3::jsonb
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`;
        params = [vectorLiteral, topK, JSON.stringify(filter)];
      } else {
        query = `SELECT topic, content, metadata, 1 - (embedding <=> $1::vector) AS similarity
                 FROM knowledge_base
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`;
        params = [vectorLiteral, topK];
      }

      const result = await client.query<KnowledgeRow>(query, params);
      return result.rows.map(r => ({
        topic: r.topic,
        content: r.content,
        similarity: Number(r.similarity),
        metadata: r.metadata ?? undefined,
      }));
    });
  }

  /**
   * Inserts a new document into the knowledge base.
   *
   * @param topic - Short topic label
   * @param content - Full text content
   * @param embedding - Pre-computed embedding vector
   * @param metadata - Optional arbitrary JSON metadata
   */
  async insert(
    topic: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.execute(
      `INSERT INTO knowledge_base (topic, content, embedding, metadata)
       VALUES ($1, $2, $3::vector, $4)`,
      [topic, content, vectorLiteral, metadata ? JSON.stringify(metadata) : null],
    );
  }
}

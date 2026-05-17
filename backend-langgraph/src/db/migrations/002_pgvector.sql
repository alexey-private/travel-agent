-- Migration 002: pgvector extension and knowledge base table
-- Enables vector similarity search for RAG (Retrieval-Augmented Generation).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic      TEXT NOT NULL,
  content    TEXT NOT NULL,
  embedding  vector(1536),
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for approximate nearest-neighbour search using cosine distance.
-- lists=100 is appropriate for tables with 10k-100k rows.
CREATE INDEX IF NOT EXISTS knowledge_embedding_idx
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

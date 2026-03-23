-- Update embedding dimension from 1536 (OpenAI) to 512 (voyage-3-lite)
-- Existing rows are cleared since random-vector embeddings are not reusable.
TRUNCATE TABLE knowledge_base;

ALTER TABLE knowledge_base
  ALTER COLUMN embedding TYPE vector(512);

DROP INDEX IF EXISTS knowledge_embedding_idx;

CREATE INDEX knowledge_embedding_idx ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

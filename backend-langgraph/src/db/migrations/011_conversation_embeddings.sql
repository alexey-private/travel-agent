CREATE TABLE IF NOT EXISTS conversation_embeddings (
  message_id   uuid        PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_type   text        NOT NULL DEFAULT 'travel',
  role         text        NOT NULL,
  embedding    vector(512) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conv_emb_user_agent_idx
  ON conversation_embeddings (user_id, agent_type);

CREATE INDEX IF NOT EXISTS conv_emb_vector_idx
  ON conversation_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

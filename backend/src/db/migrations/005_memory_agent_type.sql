-- Migration 005: Add agent_type to user_memories
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'travel'
    CHECK (agent_type IN ('travel', 'shopping'));

-- Drop old unique constraint and recreate including agent_type
ALTER TABLE user_memories DROP CONSTRAINT IF EXISTS user_memories_user_id_key_key;
ALTER TABLE user_memories ADD CONSTRAINT user_memories_user_id_key_agent_type_key
  UNIQUE (user_id, key, agent_type);

CREATE INDEX IF NOT EXISTS idx_user_memories_agent_type ON user_memories(user_id, agent_type);

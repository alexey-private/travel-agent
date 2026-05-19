-- Migration 004: Add agent_type to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'travel'
    CHECK (agent_type IN ('travel', 'shopping'));

CREATE INDEX IF NOT EXISTS idx_conversations_agent_type ON conversations(user_id, agent_type);

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'travel'
    CHECK (agent_type IN ('travel', 'shopping'));

-- Drop old unique constraint that didn't include agent_type
ALTER TABLE user_memories
  DROP CONSTRAINT IF EXISTS user_memories_user_id_key_key;

-- Add new unique constraint including agent_type (IF NOT EXISTS not supported for constraints)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_memories_user_id_key_agent_type_key') THEN
    ALTER TABLE user_memories ADD CONSTRAINT user_memories_user_id_key_agent_type_key UNIQUE (user_id, key, agent_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_memories_agent_type ON user_memories(user_id, agent_type);

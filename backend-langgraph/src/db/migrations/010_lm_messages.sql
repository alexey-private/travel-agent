-- Stores the LangGraph message sequence (tool call rounds) for each assistant turn
-- so that history can be reconstructed with proper AIMessage+ToolMessage structure.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS lm_messages JSONB;

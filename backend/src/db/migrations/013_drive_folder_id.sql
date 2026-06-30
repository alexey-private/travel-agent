ALTER TABLE google_tokens
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

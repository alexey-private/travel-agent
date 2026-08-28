-- Per-user interface and conversation language.
-- Consumed by the web UI, the Telegram bridge and the web-push cron.
-- Values are mirrored in src/i18n/locale.ts — this CHECK is the contract.

ALTER TABLE user_service_preferences
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_service_preferences_language_check'
  ) THEN
    ALTER TABLE user_service_preferences
      ADD CONSTRAINT user_service_preferences_language_check
      CHECK (language IN ('en', 'he', 'ru'));
  END IF;
END $$;

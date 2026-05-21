-- iCloud credentials (app-specific password stored AES-256-GCM encrypted)
CREATE TABLE IF NOT EXISTS icloud_tokens (
  user_id            TEXT PRIMARY KEY,
  apple_id           TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  iv                 TEXT NOT NULL,
  auth_tag           TEXT NOT NULL,
  calendar_href      TEXT,
  shopping_cal_href  TEXT,
  reminder_href      TEXT,
  shopping_rem_href  TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user service preference and calendar/task list names
CREATE TABLE IF NOT EXISTS user_service_preferences (
  user_id                  TEXT PRIMARY KEY,
  calendar_provider        TEXT NOT NULL DEFAULT 'google'
                             CHECK (calendar_provider IN ('google', 'apple')),
  calendar_name            TEXT NOT NULL DEFAULT 'Travel Agent',
  shopping_calendar_name   TEXT NOT NULL DEFAULT 'Shopping',
  task_list_name           TEXT NOT NULL DEFAULT 'Travel Plans',
  shopping_task_list_name  TEXT NOT NULL DEFAULT 'Shopping',
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

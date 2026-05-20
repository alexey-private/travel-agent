CREATE TABLE IF NOT EXISTS google_tokens (
  user_id     TEXT        PRIMARY KEY,
  access_token  TEXT      NOT NULL,
  refresh_token TEXT      NOT NULL,
  expiry_date   BIGINT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

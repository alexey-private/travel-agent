-- "No language chosen yet" is a state of its own.
--
-- 015 gave the column NOT NULL DEFAULT 'en', which left a visitor who has never
-- picked a language indistinguishable from one who deliberately picked English.
-- The web client needs exactly that distinction: only when nothing is stored may
-- it adopt the language the browser asked for. Reading a defaulted 'en' as a
-- choice would force every Hebrew-speaking first-time visitor into English.
--
-- NULL now means "not chosen"; readers apply their own default at the point of
-- use. The CHECK from 015 still holds — `NULL IN (...)` is NULL, not FALSE, so a
-- null passes it untouched.
--
-- Rows written before this migration keep their 'en' and will read as an
-- explicit choice. That is the honest reading of the data we actually have.

ALTER TABLE user_service_preferences
  ALTER COLUMN language DROP DEFAULT;

ALTER TABLE user_service_preferences
  ALTER COLUMN language DROP NOT NULL;

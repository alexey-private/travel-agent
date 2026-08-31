import { BaseRepository } from './BaseRepository';
import { Locale, isLocale } from '@travel-agent/i18n';

interface UserPreferencesRow {
  calendar_provider: string;
  calendar_name: string;
  shopping_calendar_name: string;
  task_list_name: string;
  shopping_task_list_name: string;
  language: string | null;
}

export interface UserPreferences {
  calendarProvider: 'google' | 'apple';
  calendarName: string;
  shoppingCalendarName: string;
  taskListName: string;
  shoppingTaskListName: string;
  /** null when the user has never chosen one — readers apply their own default. */
  language: Locale | null;
}

const DEFAULTS: UserPreferences = {
  calendarProvider: 'google',
  calendarName: 'Travel Agent',
  shoppingCalendarName: 'Shopping',
  taskListName: 'Travel Plans',
  shoppingTaskListName: 'Shopping',
  language: null,
};

export class UserPreferencesRepository extends BaseRepository {
  async get(userId: string): Promise<UserPreferences> {
    const row = await this.queryOne<UserPreferencesRow>(
      `SELECT calendar_provider, calendar_name, shopping_calendar_name,
              task_list_name, shopping_task_list_name, language
       FROM user_service_preferences WHERE user_id = $1`,
      [userId],
    );
    if (!row) return { ...DEFAULTS };
    return {
      calendarProvider: row.calendar_provider as 'google' | 'apple',
      calendarName: row.calendar_name,
      shoppingCalendarName: row.shopping_calendar_name,
      taskListName: row.task_list_name,
      shoppingTaskListName: row.shopping_task_list_name,
      language: isLocale(row.language) ? row.language : null,
    };
  }

  /**
   * Write the fields the patch carries, and leave the rest alone.
   *
   * `COALESCE($n, existing)` says both of those things at once for the five
   * `NOT NULL` columns, where a SQL `NULL` can only mean "not in the patch".
   * `language` is different: migration 016 made it nullable precisely so that
   * "never chose one" would be a state the column can hold, and under COALESCE
   * that state was reachable only by never having written a row at all —
   * `save(id, { language: null })` was indistinguishable from `save(id, {})`.
   *
   * So the patch says whether the key is present, and the statement believes it.
   * An explicit `undefined` counts as absent: it is what an optional property
   * carries when nobody set it, and reading it as "clear the language" would
   * turn every unrelated `save` into one.
   */
  async save(userId: string, prefs: Partial<UserPreferences>): Promise<void> {
    const setsLanguage = prefs.language !== undefined;
    await this.execute(
      `INSERT INTO user_service_preferences
         (user_id, calendar_provider, calendar_name, shopping_calendar_name,
          task_list_name, shopping_task_list_name, language, updated_at)
       VALUES (
         $1,
         COALESCE($2, 'google'),
         COALESCE($3, 'Travel Agent'),
         COALESCE($4, 'Shopping'),
         COALESCE($5, 'Travel Plans'),
         COALESCE($6, 'Shopping'),
         $7,
         NOW()
       )
       ON CONFLICT (user_id) DO UPDATE
         SET calendar_provider       = COALESCE($2, user_service_preferences.calendar_provider),
             calendar_name           = COALESCE($3, user_service_preferences.calendar_name),
             shopping_calendar_name  = COALESCE($4, user_service_preferences.shopping_calendar_name),
             task_list_name          = COALESCE($5, user_service_preferences.task_list_name),
             shopping_task_list_name = COALESCE($6, user_service_preferences.shopping_task_list_name),
             language                = CASE WHEN $8 THEN $7 ELSE user_service_preferences.language END,
             updated_at              = NOW()`,
      [
        userId,
        prefs.calendarProvider ?? null,
        prefs.calendarName ?? null,
        prefs.shoppingCalendarName ?? null,
        prefs.taskListName ?? null,
        prefs.shoppingTaskListName ?? null,
        prefs.language ?? null,
        setsLanguage,
      ],
    );
  }
}

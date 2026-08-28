import { BaseRepository } from './BaseRepository';
import { Locale, DEFAULT_LOCALE } from '../i18n/locale';

interface UserPreferencesRow {
  calendar_provider: string;
  calendar_name: string;
  shopping_calendar_name: string;
  task_list_name: string;
  shopping_task_list_name: string;
  language: string;
}

export interface UserPreferences {
  calendarProvider: 'google' | 'apple';
  calendarName: string;
  shoppingCalendarName: string;
  taskListName: string;
  shoppingTaskListName: string;
  language: Locale;
}

const DEFAULTS: UserPreferences = {
  calendarProvider: 'google',
  calendarName: 'Travel Agent',
  shoppingCalendarName: 'Shopping',
  taskListName: 'Travel Plans',
  shoppingTaskListName: 'Shopping',
  language: DEFAULT_LOCALE,
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
      language: row.language as Locale,
    };
  }

  async save(userId: string, prefs: Partial<UserPreferences>): Promise<void> {
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
         COALESCE($7, 'en'),
         NOW()
       )
       ON CONFLICT (user_id) DO UPDATE
         SET calendar_provider       = COALESCE($2, user_service_preferences.calendar_provider),
             calendar_name           = COALESCE($3, user_service_preferences.calendar_name),
             shopping_calendar_name  = COALESCE($4, user_service_preferences.shopping_calendar_name),
             task_list_name          = COALESCE($5, user_service_preferences.task_list_name),
             shopping_task_list_name = COALESCE($6, user_service_preferences.shopping_task_list_name),
             language                = COALESCE($7, user_service_preferences.language),
             updated_at              = NOW()`,
      [
        userId,
        prefs.calendarProvider ?? null,
        prefs.calendarName ?? null,
        prefs.shoppingCalendarName ?? null,
        prefs.taskListName ?? null,
        prefs.shoppingTaskListName ?? null,
        prefs.language ?? null,
      ],
    );
  }
}

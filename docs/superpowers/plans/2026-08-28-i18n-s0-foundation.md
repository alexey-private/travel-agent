# S0 — Фундамент: язык пользователя в БД и API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Язык пользователя хранится в БД, читается и записывается через `/api/settings`, и доступен коду бэкенда как типизированное значение.

**Architecture:** Новая колонка `language` в существующей таблице `user_service_preferences` (ключ — `session_id`). Эта таблица уже читается в hot-path `POST /api/chat` через `prefRepo.get(userId)` и уже отдаётся целиком в `GET /api/settings`, поэтому язык доезжает до всех потребителей без единого дополнительного запроса. Тип `Locale` объявляется в новом модуле `src/i18n/locale.ts`.

**Tech Stack:** PostgreSQL 16, Fastify, TypeScript, Jest.

**Spec:** [2026-08-28-i18n-hebrew-design.md](../specs/2026-08-28-i18n-hebrew-design.md) — §2 (хранение языка), §3 (модель локали), §5.1 (проброс языка).

## Global Constraints

См. [индекс планов](2026-08-28-i18n-hebrew-index.md#global-constraints). Коротко о том, что важно именно здесь:

- Локали ровно три: `en`, `he`, `ru`; дефолт `en`; RTL только у `he`.
- Схему менять только миграцией. `ADD CONSTRAINT IF NOT EXISTS` в PostgreSQL не существует — использовать `DO $$ … END $$`.
- Миграции прогоняются в тестовой БД идемпотентно через `setupTestDb()`, который глотает коды ошибок `42710`, `42P07`, `23505`. Новая миграция обязана быть безопасной при повторном запуске.
- Коммиты — только по явному разрешению пользователя.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `backend-langgraph/src/i18n/locale.ts` | Тип `Locale` и чистые хелперы. Без зависимостей, без побочных эффектов |
| `backend-langgraph/src/db/migrations/015_user_language.sql` | Колонка `language` + CHECK-констрейнт |
| `backend-langgraph/src/repositories/UserPreferencesRepository.ts` | Чтение/запись `language` вместе с остальными настройками |
| `backend-langgraph/src/routes/settings.ts` | Валидация `language` на входе, отдача на выходе |
| `backend-langgraph/tests/helpers/testDb.ts` | Очистка новой таблицы между тестами |
| `backend-langgraph/tests/unit/i18n/locale.test.ts` | Тесты хелперов локали |
| `backend-langgraph/tests/integration/userPreferences.test.ts` | Тесты чтения/записи `language` в реальной БД |
| `backend-langgraph/tests/unit/routes/settings.test.ts` | Тесты валидации в роуте |

---

### Task 1: Модуль локали

**Files:**
- Create: `backend-langgraph/src/i18n/locale.ts`
- Test: `backend-langgraph/tests/unit/i18n/locale.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  ```ts
  export type Locale = 'en' | 'he' | 'ru';
  export const LOCALES: readonly Locale[];
  export const DEFAULT_LOCALE: Locale;
  export function isLocale(value: unknown): value is Locale;
  export function dirOf(locale: Locale): 'ltr' | 'rtl';
  export const LANGUAGE_NAMES: Record<Locale, string>;
  ```
  На этот модуль опираются планы S4 (промпты), S5 (PDF), S7 (push).

- [ ] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/unit/i18n/locale.test.ts`:

```ts
import { LOCALES, DEFAULT_LOCALE, isLocale, dirOf, LANGUAGE_NAMES, Locale } from '@/i18n/locale';

describe('locale', () => {
  it('exposes exactly the three supported locales', () => {
    expect(LOCALES).toEqual(['en', 'he', 'ru']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('accepts supported locale strings', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('he')).toBe(true);
    expect(isLocale('ru')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('marks Hebrew as right-to-left and the rest as left-to-right', () => {
    expect(dirOf('he')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(dirOf('ru')).toBe('ltr');
  });

  it('names every locale in English for use inside prompts', () => {
    const names: Record<Locale, string> = LANGUAGE_NAMES;
    expect(names).toEqual({ en: 'English', he: 'Hebrew', ru: 'Russian' });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/i18n/locale.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — `Cannot find module '@/i18n/locale'`.

- [ ] **Step 3: Реализовать модуль**

Создать `backend-langgraph/src/i18n/locale.ts`:

```ts
/**
 * Supported interface / conversation languages.
 *
 * These three values are duplicated in `frontend/src/i18n/config.ts` and
 * `backend-telegram/src/i18n/config.ts`. The database CHECK constraint on
 * `user_service_preferences.language` is the synchronisation point — adding a
 * locale means editing all three modules and shipping a migration.
 */
export type Locale = 'en' | 'he' | 'ru';

export const LOCALES: readonly Locale[] = ['en', 'he', 'ru'] as const;

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'he' ? 'rtl' : 'ltr';
}

/** English names, used inside LLM system prompts — never shown to the user. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  he: 'Hebrew',
  ru: 'Russian',
};
```

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
npx jest tests/unit/i18n/locale.test.ts --rootDir backend-langgraph
```
Ожидается: PASS, 6 тестов.

- [ ] **Step 5: Полная проверка**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
npm run test --workspace=backend-langgraph
```

- [ ] **Step 6: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/i18n/locale.ts backend-langgraph/tests/unit/i18n/locale.test.ts
git commit -m "feat(i18n): add Locale type and helpers to backend-langgraph"
```

---

### Task 2: Миграция и колонка в репозитории

**Files:**
- Create: `backend-langgraph/src/db/migrations/015_user_language.sql`
- Modify: `backend-langgraph/src/repositories/UserPreferencesRepository.ts`
- Modify: `backend-langgraph/tests/helpers/testDb.ts` (функция `clearTestDb`)
- Test: `backend-langgraph/tests/integration/userPreferences.test.ts`

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE` из Task 1.
- Produces:
  ```ts
  interface UserPreferences {
    calendarProvider: 'google' | 'apple';
    calendarName: string;
    shoppingCalendarName: string;
    taskListName: string;
    shoppingTaskListName: string;
    language: Locale;            // ← новое поле
  }
  ```
  Поле `language` читают планы S4 (chat-роут), S6 (Telegram через API), S7 (push-cron).

- [ ] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/integration/userPreferences.test.ts`:

```ts
/**
 * Integration tests for the `language` column on user_service_preferences.
 *
 * The column feeds three consumers that never talk to each other — the web UI,
 * the Telegram bridge and the web-push cron — so its default and its CHECK
 * constraint are the only thing keeping them in agreement.
 */

import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5432/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

describe('UserPreferencesRepository — language (integration)', () => {
  let repo: UserPreferencesRepository;

  beforeAll(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await setupTestDb();
    repo = new UserPreferencesRepository(getTestPool());
  });

  beforeEach(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await clearTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  itDb('defaults to English for a user with no saved preferences', async () => {
    const prefs = await repo.get('session-no-prefs');
    expect(prefs.language).toBe('en');
  });

  itDb('defaults to English for a row saved without a language', async () => {
    await repo.save('session-partial', { calendarProvider: 'apple' });
    const prefs = await repo.get('session-partial');
    expect(prefs.language).toBe('en');
    expect(prefs.calendarProvider).toBe('apple');
  });

  itDb('persists Hebrew and reads it back', async () => {
    await repo.save('session-he', { language: 'he' });
    const prefs = await repo.get('session-he');
    expect(prefs.language).toBe('he');
  });

  itDb('updates the language without clobbering other preferences', async () => {
    await repo.save('session-mix', { calendarName: 'My Trips', language: 'ru' });
    await repo.save('session-mix', { language: 'he' });
    const prefs = await repo.get('session-mix');
    expect(prefs.language).toBe('he');
    expect(prefs.calendarName).toBe('My Trips');
  });

  itDb('leaves the language alone when save() omits it', async () => {
    await repo.save('session-keep', { language: 'ru' });
    await repo.save('session-keep', { calendarName: 'Renamed' });
    const prefs = await repo.get('session-keep');
    expect(prefs.language).toBe('ru');
  });

  itDb('rejects an unsupported language at the database level', async () => {
    await expect(
      getTestPool().query(
        `INSERT INTO user_service_preferences (user_id, language) VALUES ($1, $2)`,
        ['session-bad', 'de'],
      ),
    ).rejects.toMatchObject({ code: '23514' });   // check_violation
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph -- userPreferences
```
Ожидается: FAIL — у `UserPreferences` нет поля `language` (ошибка компиляции ts-jest).

- [ ] **Step 3: Написать миграцию**

Создать `backend-langgraph/src/db/migrations/015_user_language.sql`:

```sql
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
```

- [ ] **Step 4: Добавить очистку таблицы в тестовый хелпер**

В `backend-langgraph/tests/helpers/testDb.ts`, в функции `clearTestDb`, добавить строку **перед** `DELETE FROM users` (таблица не связана FK, но порядок сохраняем читаемым):

```ts
  await p.query('DELETE FROM user_service_preferences');
```

Итоговое тело:

```ts
export async function clearTestDb(): Promise<void> {
  const p = getTestPool();
  await p.query('DELETE FROM messages');
  await p.query('DELETE FROM user_memories');
  await p.query('DELETE FROM conversations');
  await p.query('DELETE FROM user_service_preferences');
  await p.query('DELETE FROM users');
  await p.query('DELETE FROM knowledge_base');
}
```

- [ ] **Step 5: Расширить репозиторий**

В `backend-langgraph/src/repositories/UserPreferencesRepository.ts`:

Импорт:
```ts
import { BaseRepository } from './BaseRepository';
import { Locale, DEFAULT_LOCALE } from '../i18n/locale';
```

Строка результата:
```ts
interface UserPreferencesRow {
  calendar_provider: string;
  calendar_name: string;
  shopping_calendar_name: string;
  task_list_name: string;
  shopping_task_list_name: string;
  language: string;
}
```

Публичный тип:
```ts
export interface UserPreferences {
  calendarProvider: 'google' | 'apple';
  calendarName: string;
  shoppingCalendarName: string;
  taskListName: string;
  shoppingTaskListName: string;
  language: Locale;
}
```

Дефолты:
```ts
const DEFAULTS: UserPreferences = {
  calendarProvider: 'google',
  calendarName: 'Travel Agent',
  shoppingCalendarName: 'Shopping',
  taskListName: 'Travel Plans',
  shoppingTaskListName: 'Shopping',
  language: DEFAULT_LOCALE,
};
```

Метод `get` — добавить `language` в `SELECT` и в возвращаемый объект:
```ts
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
```

Метод `save` — новый параметр `$7`, по той же схеме `COALESCE`, что и остальные поля:
```ts
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
```

- [ ] **Step 6: Применить миграцию к dev и тестовой БД**

```bash
npm run migrate --workspace=backend-langgraph
docker exec travel-agent-postgres-1 psql -U user -d travel_agent_test \
  -f /dev/stdin < backend-langgraph/src/db/migrations/015_user_language.sql
```

Тестовая БД также догоняет миграцию автоматически через `setupTestDb()` — эта команда нужна лишь чтобы убедиться, что SQL применяется без ошибок.

- [ ] **Step 7: Убедиться, что тест проходит**

```bash
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph -- userPreferences
```
Ожидается: PASS, 6 тестов.

- [ ] **Step 8: Убедиться, что миграция идемпотентна**

```bash
npm run migrate --workspace=backend-langgraph
```
Ожидается: успешное завершение без ошибок при повторном запуске.

- [ ] **Step 9: Полная проверка**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

- [ ] **Step 10: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/db/migrations/015_user_language.sql \
        backend-langgraph/src/repositories/UserPreferencesRepository.ts \
        backend-langgraph/tests/helpers/testDb.ts \
        backend-langgraph/tests/integration/userPreferences.test.ts
git commit -m "feat(i18n): persist per-user language in user_service_preferences"
```

---

### Task 3: Язык в `/api/settings`

**Files:**
- Modify: `backend-langgraph/src/routes/settings.ts:44-65` (обработчик `POST /api/settings`)
- Test: `backend-langgraph/tests/unit/routes/settings.test.ts`

**Interfaces:**
- Consumes: `isLocale` из Task 1, `UserPreferences.language` из Task 2.
- Produces: `GET /api/settings` возвращает поле `language`; `POST /api/settings` принимает `{ language }` и отвечает `400` на неизвестном значении. На этот контракт опираются планы S1 (фронт) и S6 (Telegram).

- [ ] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/unit/routes/settings.test.ts`:

```ts
import Fastify, { FastifyInstance } from 'fastify';
import { settingsRoutes } from '@/routes/settings';

const prefs = {
  calendarProvider: 'google' as const,
  calendarName: 'Travel Agent',
  shoppingCalendarName: 'Shopping',
  taskListName: 'Travel Plans',
  shoppingTaskListName: 'Shopping',
  language: 'he' as const,
};

function buildDeps() {
  return {
    icloudTokenRepo: { get: jest.fn().mockResolvedValue(null) },
    prefRepo: { get: jest.fn().mockResolvedValue(prefs), save: jest.fn().mockResolvedValue(undefined) },
    googleTokenRepo: { get: jest.fn().mockResolvedValue(null) },
    userService: { findOrCreateUser: jest.fn().mockResolvedValue('internal-uuid') },
  };
}

describe('settings routes — language', () => {
  let app: FastifyInstance;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    deps = buildDeps();
    app = Fastify();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(settingsRoutes, deps as any);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the stored language', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings?userId=u1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().language).toBe('he');
  });

  it('saves a supported language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings?userId=u1',
      payload: { language: 'ru' },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.prefRepo.save).toHaveBeenCalledWith('u1', expect.objectContaining({ language: 'ru' }));
  });

  it('rejects an unsupported language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings?userId=u1',
      payload: { language: 'de' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/language/i);
    expect(deps.prefRepo.save).not.toHaveBeenCalled();
  });

  it('accepts a body without a language and leaves it untouched', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings?userId=u1',
      payload: { calendarName: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.prefRepo.save).toHaveBeenCalledWith('u1', expect.objectContaining({ language: undefined }));
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/routes/settings.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL на тесте «rejects an unsupported language» — валидации ещё нет, роут возвращает 200.

- [ ] **Step 3: Добавить валидацию в роут**

В `backend-langgraph/src/routes/settings.ts` добавить импорт:

```ts
import { isLocale } from '../i18n/locale';
```

Заменить деструктуризацию и валидацию в обработчике `POST /api/settings`:

```ts
    const { calendarProvider, calendarName, shoppingCalendarName, taskListName, shoppingTaskListName, language } =
      req.body ?? {};

    if (calendarProvider && calendarProvider !== 'google' && calendarProvider !== 'apple') {
      return reply.code(400).send({ error: 'calendarProvider must be "google" or "apple"' });
    }

    if (language !== undefined && !isLocale(language)) {
      return reply.code(400).send({ error: 'language must be one of "en", "he", "ru"' });
    }

    await prefRepo.save(userId, {
      calendarProvider,
      calendarName,
      shoppingCalendarName,
      taskListName,
      shoppingTaskListName,
      language,
    });
```

`GET /api/settings` менять не нужно — он уже рассыпает `...prefs`, поэтому новое поле попадает в ответ автоматически.

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
npx jest tests/unit/routes/settings.test.ts --rootDir backend-langgraph
```
Ожидается: PASS, 4 теста.

- [ ] **Step 5: Полная проверка**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

- [ ] **Step 6: Обновить AGENTS.md**

В таблицу схемы БД добавить `language` к строке `user_preferences` / `user_service_preferences`; в раздел ключевых файлов добавить `backend-langgraph/src/i18n/locale.ts`.

- [ ] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/routes/settings.ts \
        backend-langgraph/tests/unit/routes/settings.test.ts \
        AGENTS.md
git commit -m "feat(i18n): accept and validate language in /api/settings"
```

---

## Определение готовности S0

- [ ] `npx tsc -p backend-langgraph/tsconfig.json --noEmit` — чисто
- [ ] `npm run test:all --workspace=backend-langgraph` — зелёный, включая 6 новых интеграционных и 4 новых юнит-теста
- [ ] Повторный `npm run migrate` не падает
- [ ] `GET /api/settings?userId=…` возвращает `"language": "en"` для нового пользователя
- [ ] `POST /api/settings` с `{"language":"de"}` возвращает 400
- [ ] `/code-review` пройден, находки закрыты, отчёт по осям Standards / Spec

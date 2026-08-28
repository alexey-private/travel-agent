# Мультиязычность travel-agent: en / he / ru

**Дата:** 2026-08-28
**Статус:** спека на согласовании
**Языки:** `en` (базовый, fallback), `he` (иврит, RTL), `ru` (русский)

---

## 1. Цель

Сделать приложение мультиязычным с полноценной поддержкой иврита — включая
направление письма (RTL) — на всех поверхностях: web-UI, служебные страницы,
язык разговора с агентом, Telegram-бот, push-уведомления и PDF-экспорт.

Иврит — не «ещё один словарь»: он меняет направление вёрстки, требует
bidi-переупорядочивания текста в PDF и влияет на качество распознавания речи и
векторного поиска. Инфраструктура закладывается на N языков, но проверяется
именно на иврите — самом требовательном из трёх.

## 2. Зафиксированные решения

| Вопрос | Решение | Причина |
|---|---|---|
| Набор языков | `en` + `he` + `ru` | Английский как fallback, иврит проверяет RTL, русский — не-латиницу без RTL |
| Default language for a new visitor | The browser's own language, read from the `Accept-Language` header server-side and from `navigator.language` client-side; `en` only when neither names a supported locale | A first-time Hebrew or Russian speaker should not have to find a switcher in a language they do not read. The header is the same preference `navigator.language` exposes, and only the header arrives in time to render `<html dir>` on the first paint |
| Механизм i18n на фронте | Свой провайдер + localStorage/cookie, **без** `/[locale]/` в URL | 4 страницы, SPA-чат без SEO-требований; next-intl потребовал бы переноса всего `app/` в `[locale]`, правок Dockerfile и тестов ради выгоды, которой здесь нет |
| Язык ответов агента | Язык из настроек + правило «если пользователь пишет на другом языке — отвечай на нём» | Предсказуемо для push/бота, но не раздражает при смешанном вводе |
| Хранение языка | `user_service_preferences.language` (ключ — `session_id`), nullable: `NULL` = язык ни разу не выбран | Таблица уже читается в hot-path `/api/chat` (`prefRepo.get`) и уже отдаётся через `/api/settings`; отдельная колонка в `users` создала бы второй дом для настроек и лишний запрос |
| Названия календарей/списков задач | Остаются английскими (`Travel Agent`, `Travel Plans`, `Shopping`) | Это идентификаторы внешних сущностей в Google/Apple; смена языка UI не должна отвязывать пользователя от уже созданного списка. Переименование доступно вручную в `/settings` |
| Англоязычные строки ошибок tools | Остаются в коде на английском; агент обязан пересказывать их на языке пользователя (правило в промпте). Отдельно локализуются HTTP-ошибки, которые фронт показывает **мимо** LLM | Строки ошибок — часть контракта с LLM и покрыты ~50 ассертами в тестах; их перевод ухудшил бы reasoning и сломал тесты без выигрыша для пользователя |
| RAG seed-база (60 документов) | Остаётся английской, переводится агентом на лету | Перевод базы — отдельная задача с отдельной ценой; `voyage-3-lite` мультиязычный, кросс-языковой retrieval работает (см. риски) |

## 3. Модель локали

Единый тип на все три workspace-пакета:

```ts
type Locale = 'en' | 'he' | 'ru';
const LOCALES: Locale[] = ['en', 'he', 'ru'];
const DEFAULT_LOCALE: Locale = 'en';
const dirOf = (l: Locale) => (l === 'he' ? 'rtl' : 'ltr');
```

Тип объявляется независимо в каждом пакете (общего workspace-пакета в проекте
нет, вводить его ради трёх строк — избыточно), но значения обязаны совпадать;
БД-констрейнт `CHECK (language IN ('en','he','ru'))` — точка синхронизации.

**Источник истины:** БД (`user_service_preferences.language`).
**Web:** локальный выбор (cookie + localStorage) применяется мгновенно и
асинхронно записывается в БД, чтобы Telegram и push знали язык пользователя.
**Telegram / push:** читают язык только из БД.

## 4. Архитектура — frontend

### 4.1 Структура

```
frontend/src/i18n/
  ├─ config.ts             Locale, LOCALES, DEFAULT_LOCALE, dirOf, isLocale
  ├─ locales/en.ts         плоский словарь — источник истины для типа
  ├─ locales/he.ts         const he: Dictionary = { ... }
  ├─ locales/ru.ts         const ru: Dictionary = { ... }
  ├─ dictionaries.ts       Record<Locale, Dictionary>; type Dictionary = typeof en
  ├─ LanguageProvider.tsx  context: { locale, setLocale, t, dir }
  ├─ useT.ts               useT() → t
  └─ format.ts             formatDate/formatTime/formatRelative/formatBytes через Intl
```

Полнота переводов гарантируется типом: `const he: Dictionary = {...}` — tsc
падает на любом пропущенном или лишнем ключе. Отдельный скрипт проверки не нужен.

### 4.2 API словаря

```ts
t('chat.send')                              // простой ключ
t('chat.filesAttached', { count: 3 })       // интерполяция {count}
t('memory.itemsCount', { count: n })        // плюрализация через Intl.PluralRules
```

Плюрализация обязательна: у русского три формы (`one/few/many`), у иврита две
(`one/other`), у английского две. Ключи с числом объявляются как объект форм:

```ts
'memory.itemsCount': { one: '{count} item', other: '{count} items' }
```

### 4.3 Отсутствие вспышки LTR

`app/layout.tsx` — server component. Читает cookie `lang` через `cookies()`
из `next/headers` и рендерит `<html lang={locale} dir={dirOf(locale)}>`.

**Компромисс:** `cookies()` переводит корневой layout в dynamic rendering.
Для этого приложения (`output: 'standalone'`, чат за клиентским состоянием,
статической генерации нет) — приемлемо и фиксируется как осознанное решение.

`LanguageProvider` — client component, инициализируется значением из cookie,
переданным пропом из layout, поэтому SSR и первый клиентский рендер совпадают.

### 4.3.1 Default language on a first visit

Language is resolved from the first source that names a supported locale:

| # | Source | Read by |
|---|---|---|
| 1 | `lang` cookie | server component (`app/layout.tsx`) |
| 2 | `localStorage.lang` | `LanguageProvider` effect |
| 3 | `user_service_preferences.language` via `GET /api/settings` | `LanguageProvider` effect |
| 4 | `Accept-Language` header | server component, passed to the provider |
| 5 | `navigator.language(s)` | `LanguageProvider` effect |
| 6 | `DEFAULT_LOCALE` (`en`) | both |

The first three are explicit choices and outrank the browser, which is only a
guess: a user who picked Hebrew in the Telegram bot gets Hebrew on the web even
from an English-configured browser.

**Step 3 needs `language` to be nullable.** As shipped in migration 015 the
column was `NOT NULL DEFAULT 'en'`, so "never chose a language" and "chose
English" read identically, and a Hebrew visitor would be handed the default and
switched to English. Migration 016 drops the default and the NOT NULL: `NULL`
means "not chosen", and every reader applies its own default at the point of
use. Rows written before 016 keep their `'en'` and read as an explicit choice —
the honest reading of the data that exists.

**Why the header outranks `navigator.language`.** Two reasons. It is the more
appropriate signal — `Accept-Language` is the visitor stating which language
they want content in, while `navigator.language` reports the language the
browser's own interface happens to be in; the two can differ. And it is the only
one that arrives in time: `navigator` exists only after hydration, so deriving
the default from it alone would render one frame of left-to-right English to
every Hebrew-speaking first-time visitor — the exact flash §4.3 exists to
prevent. `navigator` is therefore the fallback, used when no header reached us:
stripped by a proxy, or naming no language we support.

The layout passes the header result to the provider as its own prop rather than
letting the provider infer it from the rendered locale. `en` from a header and
`en` from having no header are different facts, and only the second leaves
`navigator` anything to decide.

**Matching is on the primary subtag.** `he-IL`, `he`, and the legacy `iw` all
select Hebrew; a region we do not distinguish must never cost a match.
`Accept-Language` is parsed with its q-weights and read in descending order, so
`en;q=0.9, he` yields Hebrew.

**The detected language is persisted, not re-derived per session.** On the first
visit it is written straight to the cookie, to `localStorage`, and to
`user_service_preferences.language` via `POST /api/settings` — exactly as an
explicit choice is. Nothing is overwritten by this: steps 4-5 are only reached
once steps 1-3 have all come back empty, so there is no stored preference to
lose. Persisting it is what lets the Telegram bot and push notifications speak
the right language to a user who has only ever opened the web app.

Two cases are *not* persisted. A backend that never answered: the language
still applies to the page, but writing the cookie then would pin the guess —
the server reads the cookie on every later visit, so the effect would never run
again and a language stored elsewhere would never get its turn. And a browser
that named no supported language at all: step 6 is a placeholder standing in
for an answer, not an answer, and storing it would make that visitor
indistinguishable from one who deliberately chose English — reintroducing above
the database the exact collision migration 016 removes inside it.

From then on the stored value is the source of truth. `/settings` carries a
language section where the user can override it; that write goes to the same
three places, so every later session starts from the stored language and the
browser's own setting is never consulted again.

### 4.4 Переключатель языков

Компонент `components/shared/LanguageSwitcher.tsx` — дропдаун `EN / עברית / RU`.

Общего компонента шапки в проекте нет — у каждой из четырёх страниц свой
`<header>` ([page.tsx:74](../../../frontend/src/app/page.tsx#L74),
[settings/page.tsx:133](../../../frontend/src/app/settings/page.tsx#L133),
[calendar/page.tsx:183](../../../frontend/src/app/calendar/page.tsx#L183),
[features/page.tsx:89](../../../frontend/src/app/features/page.tsx#L89)).
Переключатель вставляется в каждый из них (4 точки вставки). Извлечение общего
`<AppHeader>` — постороннее для этой задачи изменение и в объём не входит.
Дополнительно в `/settings` появляется отдельная секция «Язык / Language» —
там же, где остальные настройки пользователя.

При выборе:

1. `setLocale` → context, `document.documentElement.lang/dir`
2. запись в `localStorage` и cookie (`max-age` 1 год, `SameSite=Lax`)
3. `POST /api/settings?userId=…` с `{ language }` — fire-and-forget

### 4.5 RTL-вёрстка

Direction-зависимые Tailwind-классы заменяются на логические (Tailwind 4
поддерживает их из коробки):

| Было | Стало |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `left-0` / `right-0` | `start-0` / `end-0` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `space-x-*` | `gap-*` (внутри `flex`) |

Затронутые файлы (по убыванию риска):
[MessageBubble.tsx](../../../frontend/src/components/chat/MessageBubble.tsx) (9 мест, включая
`right-0` у дропдауна действий), [page.tsx](../../../frontend/src/app/page.tsx) (слайд-панели
`left-0`/`right-0` и направление анимации), [ChatWindow.tsx](../../../frontend/src/components/chat/ChatWindow.tsx) (3),
[AgentThoughts.tsx](../../../frontend/src/components/chat/AgentThoughts.tsx) (2),
[calendar/page.tsx](../../../frontend/src/app/calendar/page.tsx) (2),
[ConversationList.tsx](../../../frontend/src/components/conversations/ConversationList.tsx) (1).

**Ответ агента рендерится с `dir="auto"`.** Язык ответа не обязан совпадать с
языком UI (агент подстраивается под сообщение пользователя), поэтому направление
блока сообщения определяется его содержимым, а не настройкой интерфейса.
То же для поля ввода.

### 4.6 Форматирование

[lib/dateUtils.ts](../../../frontend/src/lib/dateUtils.ts) сейчас вызывает
`toLocaleDateString([])` — браузерная локаль, не связанная с языком приложения.
Функции принимают `locale` явным параметром и используют
`Intl.DateTimeFormat(locale)`. Строка «Yesterday» заменяется на
`Intl.RelativeTimeFormat`.
[lib/fileUtils.ts](../../../frontend/src/lib/fileUtils.ts) — размеры файлов через
`Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte' })`.

Единица измерения берётся из CLDR как есть, и для иврита это означает разное на
разных порядках: `byte` имеет ивритское обозначение (`512 בייט`), а `kilobyte` и
`megabyte` — нет, иврит пишет их латиницей (`3.3 MB`), как пишет `Google` и
`Telegram`. Это не пробел в переводе, а то, как язык сам себя записывает, поэтому
своей таблицы сокращений мы не заводим. Русский, наоборот, получает и разделитель,
и обозначение: `3,3 МБ`.

### 4.7 Стартовые подсказки

[data/starterSuggestions.ts](../../../frontend/src/data/starterSuggestions.ts) содержит 40 фраз
и захардкоженный массив названий месяцев. Названия месяцев заменяются на
`Intl.DateTimeFormat(locale, { month: 'long' })`. Фразы — это **не UI-строки, а
сообщения, уходящие в LLM**, поэтому нужны полноценные локализованные наборы
(не машинный перевод английских): естественные для иврита и русского запросы,
покрывающие тот же набор инструментов.

`Intl` отдаёт название месяца в именительном падеже (`октябрь`), поэтому русские
фразы строятся с предлогом «на» — винительный падеж совпадает с именительным у
всех двенадцати месяцев, — а не с «в», который потребовал бы предложного
(«в октябре»). Иврит присоединяет предлог приставкой: `ב` + `אוקטובר`.

## 5. Архитектура — backend-langgraph

### 5.1 Проброс языка

- Миграция `015_user_language.sql`:
  `ALTER TABLE user_service_preferences ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'`
  + `CHECK (language IN ('en','he','ru'))` через `DO $$ … END $$` (в PostgreSQL
  нет `ADD CONSTRAINT IF NOT EXISTS` — см. SKILL.md).
- `UserPreferences` / `UserPreferencesRepository` — поле `language`.
- `/api/settings` GET отдаёт `language`, POST принимает и валидирует.
- `ChatBody.language?: Locale`. Приоритет: `body.language` → `prefs.language` →
  `'en'`. Если `body.language` пришёл и отличается от сохранённого — пишется в БД
  (не блокируя стрим).
- `AgentState` — `language: Annotation<Locale>` (LastValue).
- `buildTravelAgentSystemPrompt` / `buildShoppingAgentSystemPrompt` — новый
  параметр `language`.

### 5.2 Блок Language в системном промпте

Общий для обоих агентов (как `TELEGRAM_FORMATTING`), вставляется **до** секции
форматирования:

```
## Language — ALWAYS apply
The user's interface language is {Hebrew|Russian|English}, but the language of their LATEST message overrides it.
- Work out which language the latest user message is written in. Do this silently.
- If it is not that language, reply in THAT language, and ignore the setting for this turn.
- Otherwise write your ENTIRE response in the interface language.
- Tool results come back in English. Translate their content into the response language —
  never surface raw English tool output or tool error text to the user.
- Keep unchanged: airport/IATA codes, airline and hotel names, product model names,
  currency codes, URLs.
- Hebrew: numbers, dates, prices and Latin identifiers stay as-is — they render correctly
  inside right-to-left text.
```

Правило про перевод tool-результатов — то, чем закрывается пункт «ошибки tools»
из объёма: строки в коде остаются английскими (контракт с LLM, ~50 ассертов в
тестах), но пользователь их на английском не увидит.

Формулировка правила «следуй за языком сообщения» получена проверкой на живом
агенте, а не выведена из текста: при мягком «by default … instead» модель
устойчиво отвечала на языке настройки, игнорируя английский вопрос. Сработала
только явная инверсия приоритета с примером. Указание «do this silently» тоже
добавлено по факту: без него агент открывал ответ строкой вида «השפה: עברית».

Следствие, которого в первоначальной спеке не было: раз язык ответа может
отличаться от языка настройки, follow-up подсказки должны строиться по языку
**ответа**. Его определяет
[detectReplyLocale](../../../backend-langgraph/src/i18n/detectReplyLocale.ts) — по
письменности текста, чего достаточно, поскольку три поддерживаемых языка
используют три разных алфавита. Латиница считается последней и проигрывает
ничьи: в ивритском и русском ответах регулярно встречаются IATA-коды и названия
авиакомпаний, обратного не бывает.

### 5.3 Остальные LLM-промпты

- [SuggestionService](../../../backend-langgraph/src/services/SuggestionService.ts) — `getSuggestions(..., language)`,
  follow-up вопросы генерируются на языке пользователя.
- [MemoryService](../../../backend-langgraph/src/services/MemoryService.ts) — extraction-промптам передаётся язык.
  **Ключи памяти остаются английскими** (`home_city`, `diet`) — это стабильные
  machine keys, по которым идёт дедупликация; значения — на языке пользователя.
  Regex-гейт first-person высказываний покрывает только EN и RU
  ([MemoryService.ts:42-43](../../../backend-langgraph/src/services/MemoryService.ts#L42-L43)) — добавляются
  ивритские паттерны (`אני`, `שלי`, `אנחנו`).

### 5.4 Распознавание речи

[routes/transcribe.ts](../../../backend-langgraph/src/routes/transcribe.ts) отправляет в Whisper без
подсказки языка. Добавляется `form.append('language', locale)` — для иврита это
заметно поднимает точность и убирает случаи транслитерации в латиницу.

### 5.5 Локализованные HTTP-ошибки

Ошибки, которые фронт показывает пользователю напрямую (400/502/503 из
`/api/chat`, `/api/export`, `/api/settings`, `/api/transcribe`), возвращаются
c машинным кодом:

```json
{ "error": "Google Drive is not configured on this server.", "code": "drive_not_configured" }
```

Фронт переводит по `code`, с fallback на `error` (английский текст). Поле `error`
сохраняется — обратная совместимость и существующие тесты не ломаются.

## 6. PDF-экспорт с RTL

Самая нетривиальная часть. Сейчас [routes/export.ts](../../../backend-langgraph/src/routes/export.ts)
рендерит markdown вручную в pdfkit со шрифтом DejaVuSans.

**Факты:** DejaVuSans содержит глифы базового блока иврита (U+0590–U+05FF), но
pdfkit **не реализует Unicode Bidirectional Algorithm**. Строка `שלום 2026` без
обработки выйдет глифами в логическом (LTR) порядке — то есть визуально
задом наперёд. Иврит, в отличие от арабского, не требует glyph shaping
(нет курсивного соединения), поэтому достаточно переупорядочивания.

**Решение:** пакет `bidi-js@1.0.3` (чистая JS-реализация UBA). Типов не
поставляет — добавляется локальный `backend-langgraph/src/types/bidi-js.d.ts`.

Новый модуль `backend-langgraph/src/utils/bidi.ts`:

```ts
containsRtl(text: string): boolean                     // есть ли символы U+0590–U+08FF
toVisual(text: string, baseDir: 'ltr'|'rtl'): string   // логический → визуальный порядок
wrapToWidth(text, maxWidth, measure): string[]         // перенос строк ДО переупорядочивания
```

Уточнение по API: у `bidi-js` **нет** функции, возвращающей готовую строку.
Пакет отдаёт диапазоны для разворота (`getReorderSegments`) и карту зеркалируемых
символов (`getMirroredCharactersMap`); склейку делает `toVisual`. Индексы — по
кодовым единицам UTF-16.

Перенос строк обязан идти **до** переупорядочивания: UBA определён для каждой
визуальной строки отдельно, поэтому отдать автоперенос pdfkit нельзя — он
разрежет уже перевёрнутый абзац в произвольном месте.

Изменения в `export.ts`:

- `buildPdfBuffer(text, locale?)` определяет базовое направление: по `locale`,
  а при его отсутствии — по содержимому через `containsRtl`.
- Единая точка `write(doc, text, opts)`: при `baseDir === 'rtl'` прогоняет текст
  через `toVisual` и добавляет `align: 'right'`.
- **Таблицы:** порядок колонок инвертируется (`colX` считается справа налево),
  ячейки выравниваются вправо, содержимое проходит через `toVisual`.
- **Списки и цитаты:** `indent` становится правым отступом; маркер `•` и номер
  ставятся логически (UBA сам расположит их справа).
- Заголовки — `align: 'right'`.

Смешанный текст (иврит + латиница + числа) обрабатывается UBA корректно
автоматически — это и есть причина брать библиотеку, а не разворачивать строку
вручную.

Роуты `/api/export/pdf` и `/api/export/pdf-to-drive` принимают необязательный
`language`; фронт его передаёт.

## 7. Telegram-бот

- `backend-telegram/src/i18n/` — та же схема словарей (~75 ключей), тот же тип.
- Язык читается из `GET /api/settings?userId=tg-<id>` и кэшируется в grammY-сессии.
- Новая команда `/lang` с инлайн-клавиатурой → `POST /api/settings`.
- `setMyCommands` регистрируется трижды — Telegram поддерживает scope
  `language_code`, поэтому меню команд локализуется нативно.
- `TRAVEL_POOL` / `SHOPPING_POOL` в [commands/start.ts](../../../backend-telegram/src/commands/start.ts) —
  локализованные наборы. Как и на фронте, это одновременно подпись кнопки и
  текст, уходящий в LLM, поэтому они обязаны быть на языке пользователя.
- [notifier/calendar.cron.ts](../../../backend-telegram/src/notifier/calendar.cron.ts) — тексты напоминаний
  по языку получателя.

## 8. Web-push

[notifier/web-push.cron.ts](../../../backend-langgraph/src/notifier/web-push.cron.ts) сейчас шлёт один
английский шаблон всем. Запрос подписок дополняется
`LEFT JOIN user_service_preferences p ON p.user_id = u.session_id`, тексты берутся
из словаря `src/i18n/notifications.ts` (3 языка), время форматируется через
`Intl.DateTimeFormat(locale)`.

## 9. Тестирование

**Frontend.** Существующие тесты (~47 ассертов на английский микрокопирайт)
оборачиваются в `LanguageProvider` с `locale='en'` — тексты те же, ассерты в
основном не меняются. Новые тесты:
- `dir`/`lang` на `<html>` переключаются при смене языка
- `LanguageSwitcher` меняет локаль и пишет cookie
- форматирование дат/чисел для трёх локалей
- RTL: у ключевых контейнеров логические классы, ответ агента имеет `dir="auto"`

**Backend.** Новые:
- `utils/bidi.ts` — чистый иврит, смешанный с числами и латиницей, пустая строка,
  идемпотентность для чистого LTR
- PDF: генерация для `he` не падает, буфер валиден, таблица с ивритом рендерится
- промпты: блок Language присутствует и называет верный язык
- `SuggestionService` / `MemoryService`: язык доходит до промпта
- `UserPreferencesRepository`: чтение/запись `language`, дефолт `'en'`,
  отказ на неизвестном значении
- push-cron: выбирается шаблон по языку подписчика

Тесты строк ошибок tools **не меняются** — строки остаются английскими.

**Команды после каждой подзадачи** (обязательны):
```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
npm run test --workspace=frontend
npm run typecheck --workspace=backend-telegram
```

## 10. Декомпозиция

Задача крупная, поэтому режется на подзадачи. Каждая проходит полный конвейер:
**план → реализация → тесты → `/code-review`**, и только после зелёного ревью
начинается следующая.

| # | Подзадача | Содержание | Зависит от |
|---|---|---|---|
| **S0** | Фундамент | Миграция 015, `language` в репозитории и `/api/settings`, тип `Locale` в трёх пакетах | — |
| **S1** | Каркас i18n на фронте | Провайдер, `useT`, словарь `en` (извлечение ~280 строк), cookie/localStorage, `<html lang dir>`, `LanguageSwitcher` | S0 |
| **S2** | RTL-вёрстка | Логические Tailwind-классы, `dir="auto"` для ответов, слайд-панели, `MessageBubble` | S1 |
| **S3** | Переводы he + ru | Заполнение словарей, локализованные `starterSuggestions`, `Intl`-форматирование | S1 |
| **S4** | Язык агента | `language` в `AgentState`/`ChatBody`, блок Language в промптах, `SuggestionService`, `MemoryService`, Whisper hint, коды HTTP-ошибок | S0 |
| **S5** | PDF RTL | `bidi-js`, `utils/bidi.ts`, переработка `export.ts`, тесты | S0 |
| **S6** | Telegram-бот | Словари, `/lang`, `setMyCommands` по языкам, локализованные подсказки, cron | S0 |
| **S7** | Web-push | Язык в cron, словарь уведомлений, `Intl`-форматирование времени | S0 |

Порядок: **S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7**.
S3 и S4 независимы между собой; S5–S7 независимы от фронтовых подзадач и могут
идти в любом порядке после S0.

## 11. Риски и открытые вопросы

| Риск | Оценка | Что делаем |
|---|---|---|
| Кросс-языковой RAG: ивритский запрос против английской базы из 60 документов | Средний. `voyage-3-lite` мультиязычный, но recall ниже, чем внутри одного языка | Оставляем как есть, замеряем на реальных запросах. Перевод базы — отдельная задача, если качество не устроит |
| `cookies()` в root layout → dynamic rendering всего приложения | Низкий | Осознанное решение (§4.3); статической генерации в проекте и так нет |
| pdfkit + bidi: сложные случаи (вложенные направления, таблицы со смешанным текстом) | Средний | Юнит-тесты на смешанных строках; при проблемах деградируем к «весь абзац одним направлением» |
| Смешанный ввод (пользователь пишет на иврите при русском UI) | Низкий | Правило в промпте §5.2; ответ рендерится с `dir="auto"`, поэтому вёрстка не ломается |
| Расхождение локального языка (cookie) и языка в БД | Низкий | Web пишет в БД при каждой смене; при расхождении побеждает локальный выбор |
| Существующие пользователи после миграции | Нет | `DEFAULT 'en'` сохраняет текущее поведение до явной смены языка |

## 12. Вне объёма

- Перевод RAG seed-базы (`db/seed.ts`, `db/seed-shopping.ts`, 60 документов)
- Локализация названий календарей и списков задач (§2)
- Арабский и другие RTL-языки (инфраструктура готова, наборы переводов — нет)
- Локализация URL/роутов (`/settings` не превращается в `/he/settings`)
- Перевод сообщений об ошибках в коде tools (§2)

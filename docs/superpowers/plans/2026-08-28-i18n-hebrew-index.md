# i18n (en / he / ru) — индекс планов

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать travel-agent мультиязычным (английский, иврит, русский) с полноценным RTL — в UI, в языке разговора с агентом, в Telegram-боте, в push-уведомлениях и в PDF-экспорте.

**Spec:** [2026-08-28-i18n-hebrew-design.md](../specs/2026-08-28-i18n-hebrew-design.md)

**Architecture:** Язык хранится в БД (`user_service_preferences.language`) и оттуда доезжает до всех трёх пакетов workspace. Фронт использует собственный `LanguageProvider` (React Context + cookie + localStorage) без locale-роутинга; направление письма выставляется на `<html>` в server-component layout. Backend прокидывает язык через `AgentState` в системный промпт. PDF получает bidi-переупорядочивание через `bidi-js`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (logical properties), Fastify, LangGraph, PostgreSQL 16, `bidi-js@1.0.3`, pdfkit, grammY.

---

## Global Constraints

Действуют для **каждой** задачи во **всех** планах ниже.

- Локали ровно три: `en`, `he`, `ru`. Дефолт — `en`. RTL только у `he`.
- Значения локалей продублированы в трёх местах и обязаны совпадать: `backend-langgraph/src/i18n/locale.ts`, `frontend/src/i18n/config.ts`, `backend-telegram/src/i18n/config.ts`. Точка синхронизации — БД-констрейнт `CHECK (language IN ('en','he','ru'))`.
- Единственный бэкенд — `backend-langgraph/`. Каталог `backend/` удалён (тег `legacy-react-backend`); любые указания «применить к обоим бэкендам» из истории коммитов устарели.
- **Схему БД менять только миграциями.** Никаких прямых `ALTER TABLE` на dev/prod. В PostgreSQL нет `ADD CONSTRAINT IF NOT EXISTS` — использовать блок `DO $$ … END $$`.
- После **каждой** задачи прогоняются все четыре проверки:
  ```bash
  npx tsc -p backend-langgraph/tsconfig.json --noEmit
  TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
    npm run test:all --workspace=backend-langgraph
  npm run test --workspace=frontend
  npm run typecheck --workspace=backend-telegram
  ```
- После **каждой** подзадачи (S0…S7) обязателен `/code-review`; отчитываться по обеим осям (Standards / Spec). Зелёные тесты его не заменяют.
- **Коммиты выполняются только по явному разрешению пользователя** — правило проекта. Шаги «Commit» приводят точную команду, но не выполняются без подтверждения. Push в `main`, force-push и merge — запрещены.
- Строки ошибок в коде инструментов (`src/tools/**`) **не переводятся** — они часть контракта с LLM и покрыты ~50 ассертами. Пользователь видит их на своём языке потому, что промпт обязывает агента пересказывать содержимое tool-результатов.
- Названия календарей и списков задач (`Travel Agent`, `Travel Plans`, `Shopping`) остаются английскими — это идентификаторы внешних сущностей в Google/Apple.
- Ключи пользовательской памяти (`home_city`, `diet`, …) остаются английскими; локализуются только значения.

---

## Общий контракт локали

Один и тот же по смыслу модуль в трёх пакетах. Сигнатуры обязаны совпадать буква в букву — на них ссылаются все планы.

```ts
export type Locale = 'en' | 'he' | 'ru';
export const LOCALES: readonly Locale[] = ['en', 'he', 'ru'] as const;
export const DEFAULT_LOCALE: Locale = 'en';
export function isLocale(value: unknown): value is Locale;
export function dirOf(locale: Locale): 'ltr' | 'rtl';
```

Дополнительно только в backend-пакетах:

```ts
export const LANGUAGE_NAMES: Record<Locale, string>; // { en: 'English', he: 'Hebrew', ru: 'Russian' }
```

Дополнительно только во фронте:

```ts
export const LOCALE_LABELS: Record<Locale, string>;  // { en: 'EN', he: 'עברית', ru: 'RU' }
export const LANG_COOKIE = 'lang';
```

---

## Порядок выполнения

| # | План | Зависит от | Результат |
|---|---|---|---|
| **S0** | [s0-foundation](2026-08-28-i18n-s0-foundation.md) | — | `language` в БД и в `/api/settings` |
| **S1** | [s1-frontend-core](2026-08-28-i18n-s1-frontend-core.md) | S0 | Каркас i18n, словарь `en`, переключатель языков |
| **S2** | [s2-rtl-layout](2026-08-28-i18n-s2-rtl-layout.md) | S1 | Вёрстка переживает `dir="rtl"` |
| **S3** | [s3-translations](2026-08-28-i18n-s3-translations.md) | S1 | Словари `he` и `ru`, `Intl`-форматирование |
| **S4** | [s4-agent-language](2026-08-28-i18n-s4-agent-language.md) | S0 | Агент отвечает на языке пользователя |
| **S5** | [s5-pdf-rtl](2026-08-28-i18n-s5-pdf-rtl.md) | S0 | PDF с корректным ивритом |
| **S6** | [s6-telegram](2026-08-28-i18n-s6-telegram.md) | S0 | Локализованный бот, команда `/lang` |
| **S7** | [s7-web-push](2026-08-28-i18n-s7-web-push.md) | S0 | Уведомления на языке подписчика |

Рекомендуемая последовательность: **S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7**.

S3 и S4 независимы между собой. S5, S6 и S7 не зависят от фронтовых подзадач и после S0 могут идти в любом порядке — но каждая проходит собственный цикл «реализация → тесты → `/code-review`» до начала следующей.

---

## Определение готовности всей задачи

- [ ] Все восемь подзадач прошли `/code-review` без незакрытых находок
- [ ] Переключение на иврит меняет `dir` на `rtl` и не ломает ни одну из четырёх страниц
- [ ] Агент отвечает на иврите; при сообщении на другом языке переключается на него
- [ ] PDF-экспорт ответа на иврите читается правильно (порядок слов, числа, таблицы)
- [ ] Telegram-бот и push-уведомления используют язык из настроек пользователя
- [ ] `AGENTS.md` дополнен: новая колонка БД, каталоги `i18n/`, зависимость `bidi-js`
- [ ] `SKILL.md` дополнен рецептом «добавить строку в словарь / добавить язык»

# S1 — Каркас i18n на фронте и переключатель языков

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Все английские строки интерфейса живут в словаре, компонент читает их через `useT()`, а пользователь может переключить язык — при этом на `<html>` выставляются правильные `lang` и `dir`.

**Architecture:** Собственный `LanguageProvider` на React Context. Выбранный язык хранится в cookie `lang` (её читает server-component `app/layout.tsx`, поэтому `dir` приходит уже правильным и вспышки LTR нет) и дублируется в `localStorage` на случай, если cookie потеряется. При смене языка значение асинхронно уезжает в `POST /api/settings`, чтобы Telegram-бот и push-уведомления знали язык пользователя. Locale-роутинга нет — URL не меняется.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Jest + Testing Library.

**Spec:** [2026-08-28-i18n-hebrew-design.md](../specs/2026-08-28-i18n-hebrew-design.md) — §4.1–4.4.

## Global Constraints

См. [индекс планов](2026-08-28-i18n-hebrew-index.md#global-constraints). Важное именно здесь:

- Локали ровно три: `en`, `he`, `ru`; дефолт `en`; RTL только у `he`.
- В этой подзадаче заполняется **только** словарь `en`. Файлы `he.ts` и `ru.ts` создаются, но содержат копию английских значений — их перевод это S3. Так тесты остаются зелёными, а тип уже проверяет полноту.
- Английский текст переносится в словарь **дословно**, символ в символ. Любая правка формулировок — отдельное изменение, не в этой подзадаче.
- Алиас импорта в проекте — `@/` → `frontend/src/` (см. `frontend/jest.config.js`).
- Тесты фронта живут в `frontend/src/__tests__/**/*.test.tsx`.
- Коммиты — только по явному разрешению пользователя.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `frontend/src/i18n/config.ts` | `Locale`, `LOCALES`, `DEFAULT_LOCALE`, `isLocale`, `dirOf`, `LOCALE_LABELS`, имена cookie и ключа localStorage |
| `frontend/src/i18n/types.ts` | `PluralForms`, `Entry`, `TVars` |
| `frontend/src/i18n/locales/en.ts` | Английский словарь — источник истины для типа `Dictionary` |
| `frontend/src/i18n/locales/he.ts` | Ивритский словарь (в S1 — копия английского) |
| `frontend/src/i18n/locales/ru.ts` | Русский словарь (в S1 — копия английского) |
| `frontend/src/i18n/dictionaries.ts` | `Dictionary`, `TKey`, `DICTIONARIES` |
| `frontend/src/i18n/translate.ts` | Чистая функция подстановки: плюрализация + интерполяция |
| `frontend/src/i18n/LanguageProvider.tsx` | Контекст, persistence, синхронизация `<html>`, отправка в API |
| `frontend/src/i18n/useT.ts` | Хуки `useT()` и `useLocale()` |
| `frontend/src/components/shared/LanguageSwitcher.tsx` | Дропдаун выбора языка |
| `frontend/src/app/layout.tsx` | Чтение cookie, `<html lang dir>`, монтирование провайдера |
| `frontend/src/__tests__/helpers/renderWithI18n.tsx` | Обёртка рендера для всех остальных тестов |

---

### Task 1: Конфигурация локали

**Files:**
- Create: `frontend/src/i18n/config.ts`
- Test: `frontend/src/__tests__/i18n/config.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  ```ts
  export type Locale = 'en' | 'he' | 'ru';
  export const LOCALES: readonly Locale[];
  export const DEFAULT_LOCALE: Locale;
  export function isLocale(value: unknown): value is Locale;
  export function dirOf(locale: Locale): 'ltr' | 'rtl';
  export const LOCALE_LABELS: Record<Locale, string>;
  export const LANG_COOKIE = 'lang';
  export const LANG_STORAGE_KEY = 'lang';
  ```

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/i18n/config.test.ts`:

```ts
import { LOCALES, DEFAULT_LOCALE, isLocale, dirOf, LOCALE_LABELS, LANG_COOKIE } from "@/i18n/config";

describe("i18n config", () => {
  it("exposes exactly the three supported locales", () => {
    expect(LOCALES).toEqual(["en", "he", "ru"]);
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("recognises supported locales and rejects everything else", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("marks Hebrew as right-to-left", () => {
    expect(dirOf("he")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(dirOf("ru")).toBe("ltr");
  });

  it("labels each locale in its own script", () => {
    expect(LOCALE_LABELS).toEqual({ en: "EN", he: "עברית", ru: "RU" });
  });

  it("names the cookie", () => {
    expect(LANG_COOKIE).toBe("lang");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- i18n/config
```
Ожидается: FAIL — модуль `@/i18n/config` не найден.

- [ ] **Step 3: Реализовать модуль**

Создать `frontend/src/i18n/config.ts`:

```ts
/**
 * Supported UI languages.
 *
 * These three values are mirrored in `backend-langgraph/src/i18n/locale.ts` and
 * `backend-telegram/src/i18n/config.ts`, and enforced by the CHECK constraint on
 * `user_service_preferences.language`. Adding a locale means touching all four.
 */
export type Locale = "en" | "he" | "ru";

export const LOCALES: readonly Locale[] = ["en", "he", "ru"] as const;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Shown in the language switcher — each label is written in its own script. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  he: "עברית",
  ru: "RU",
};

/** Read by the server component in app/layout.tsx to render <html dir> correctly. */
export const LANG_COOKIE = "lang";

/** Mirror of the cookie, used only when the cookie is missing. */
export const LANG_STORAGE_KEY = "lang";

/** One year, in seconds. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
```

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- i18n/config
```
Ожидается: PASS, 6 тестов.

- [ ] **Step 5: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/i18n/config.ts frontend/src/__tests__/i18n/config.test.ts
git commit -m "feat(i18n): add locale config to frontend"
```

---

### Task 2: Словарь и функция подстановки

**Files:**
- Create: `frontend/src/i18n/types.ts`
- Create: `frontend/src/i18n/locales/en.ts`
- Create: `frontend/src/i18n/locales/he.ts`
- Create: `frontend/src/i18n/locales/ru.ts`
- Create: `frontend/src/i18n/dictionaries.ts`
- Create: `frontend/src/i18n/translate.ts`
- Test: `frontend/src/__tests__/i18n/translate.test.ts`

**Interfaces:**
- Consumes: `Locale` из Task 1.
- Produces:
  ```ts
  // types.ts
  export interface PluralForms { one: string; two?: string; few?: string; many?: string; other: string }
  export type Entry = string | PluralForms;
  export type TVars = Record<string, string | number>;

  // dictionaries.ts
  export type Dictionary = typeof en;
  export type TKey = keyof Dictionary;
  export const DICTIONARIES: Record<Locale, Dictionary>;

  // translate.ts
  export function translate(dict: Dictionary, locale: Locale, key: TKey, vars?: TVars): string;
  ```
  `TKey` — тип, которым Task 3 типизирует `t`, а Task 6 пополняет ключами.

**Почему тип, а не скрипт проверки:** `Dictionary` выводится из `en.ts`, а `he.ts` и `ru.ts` объявлены как `const he: Dictionary = {…}`. Пропущенный ключ — ошибка компиляции, лишний — тоже (excess property check). Отдельный скрипт полноты переводов не нужен.

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/i18n/translate.test.ts`:

```ts
import { translate } from "@/i18n/translate";
import type { Dictionary } from "@/i18n/dictionaries";
import type { PluralForms } from "@/i18n/types";

const dict = {
  "chat.send": "Send",
  "chat.attached": "{count} file attached",
  "memory.itemsCount": { one: "{count} item", other: "{count} items" } as PluralForms,
  "memory.itemsCountRu": { one: "{count} запись", few: "{count} записи", many: "{count} записей", other: "{count} записи" } as PluralForms,
} as unknown as Dictionary;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const key = (k: string) => k as any;

describe("translate", () => {
  it("returns a plain string as-is", () => {
    expect(translate(dict, "en", key("chat.send"))).toBe("Send");
  });

  it("interpolates named variables", () => {
    expect(translate(dict, "en", key("chat.attached"), { count: 3 })).toBe("3 file attached");
  });

  it("leaves an unknown placeholder untouched", () => {
    expect(translate(dict, "en", key("chat.attached"))).toBe("{count} file attached");
  });

  it("selects the English singular and plural", () => {
    expect(translate(dict, "en", key("memory.itemsCount"), { count: 1 })).toBe("1 item");
    expect(translate(dict, "en", key("memory.itemsCount"), { count: 5 })).toBe("5 items");
  });

  it("selects Russian few and many forms", () => {
    expect(translate(dict, "ru", key("memory.itemsCountRu"), { count: 1 })).toBe("1 запись");
    expect(translate(dict, "ru", key("memory.itemsCountRu"), { count: 3 })).toBe("3 записи");
    expect(translate(dict, "ru", key("memory.itemsCountRu"), { count: 7 })).toBe("7 записей");
  });

  it("falls back to `other` when a locale asks for a form the entry lacks", () => {
    expect(translate(dict, "ru", key("memory.itemsCount"), { count: 3 })).toBe("3 items");
  });

  it("returns the key itself when it is missing from the dictionary", () => {
    expect(translate(dict, "en", key("nope.missing"))).toBe("nope.missing");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- i18n/translate
```
Ожидается: FAIL — модуль `@/i18n/translate` не найден.

- [ ] **Step 3: Создать типы**

Создать `frontend/src/i18n/types.ts`:

```ts
/**
 * Plural forms of one dictionary entry.
 *
 * `other` is mandatory and doubles as the fallback: Russian needs `few` and
 * `many`, Hebrew and English do not, so every form except `other` is optional.
 */
export interface PluralForms {
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Entry = string | PluralForms;

export type TVars = Record<string, string | number>;
```

- [ ] **Step 4: Создать английский словарь-заготовку**

Создать `frontend/src/i18n/locales/en.ts`. В этой задаче в нём только ключи, нужные для проверки механики — остальные ~280 добавляются в Task 6:

```ts
import type { PluralForms } from "../types";

/**
 * English dictionary — the source of truth for the `Dictionary` type.
 *
 * Keys are flat and namespaced by surface: `common.*`, `chat.*`, `memory.*`,
 * `conversations.*`, `settings.*`, `calendar.*`, `features.*`, `errors.*`.
 * Entries with a `{count}` placeholder are declared `as PluralForms`.
 */
export const en = {
  "common.loading": "Loading…",
  "common.language": "Language",

  "memory.itemsCount": { one: "{count} item", other: "{count} items" } as PluralForms,
};
```

- [ ] **Step 5: Создать словари he и ru как копии английского**

Создать `frontend/src/i18n/locales/he.ts`:

```ts
import type { Dictionary } from "../dictionaries";
import type { PluralForms } from "../types";

/**
 * Hebrew dictionary.
 *
 * Values are still English — translating them is subtask S3. The `Dictionary`
 * annotation is what matters now: it makes the compiler reject a missing or
 * misspelled key the moment a new string lands in en.ts.
 */
export const he: Dictionary = {
  "common.loading": "Loading…",
  "common.language": "Language",

  "memory.itemsCount": { one: "{count} item", other: "{count} items" } as PluralForms,
};
```

Создать `frontend/src/i18n/locales/ru.ts` — тот же файл с `export const ru: Dictionary` и той же докстрокой, заменив «Hebrew» на «Russian».

Импорт `Dictionary` из `../dictionaries` образует цикл `he.ts → dictionaries.ts → he.ts`,
но он безопасен: импорт объявлен как `import type`, поэтому на этапе компиляции
стирается и в рантайме цикла не возникает. Именно поэтому в этих двух файлах
обязательно `import type`, а не обычный `import`.

- [ ] **Step 6: Создать реестр словарей**

Создать `frontend/src/i18n/dictionaries.ts`:

```ts
import type { Locale } from "./config";
import { en } from "./locales/en";
import { he } from "./locales/he";
import { ru } from "./locales/ru";

/** Shape of every dictionary, inferred from the English one. */
export type Dictionary = typeof en;

/** Every valid translation key. */
export type TKey = keyof Dictionary;

export const DICTIONARIES: Record<Locale, Dictionary> = { en, he, ru };
```

- [ ] **Step 7: Реализовать подстановку**

Создать `frontend/src/i18n/translate.ts`:

```ts
import type { Locale } from "./config";
import type { Dictionary, TKey } from "./dictionaries";
import type { PluralForms, TVars } from "./types";

const PLACEHOLDER = /\{(\w+)\}/g;

function isPluralForms(entry: unknown): entry is PluralForms {
  return typeof entry === "object" && entry !== null && "other" in entry;
}

/**
 * Resolves one dictionary key into a display string.
 *
 * Plural selection goes through Intl.PluralRules rather than a hand-rolled
 * rule, because Russian needs one/few/many while Hebrew and English need only
 * one/other — and `other` is the fallback whenever an entry lacks the form the
 * locale asked for.
 */
export function translate(dict: Dictionary, locale: Locale, key: TKey, vars?: TVars): string {
  const entry: unknown = dict[key];

  if (entry === undefined) return String(key);

  let template: string;
  if (isPluralForms(entry)) {
    const count = Number(vars?.count ?? 0);
    const form = new Intl.PluralRules(locale).select(count) as keyof PluralForms;
    template = entry[form] ?? entry.other;
  } else {
    template = String(entry);
  }

  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
```

- [ ] **Step 8: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- i18n/translate
```
Ожидается: PASS, 7 тестов.

- [ ] **Step 9: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/i18n frontend/src/__tests__/i18n/translate.test.ts
git commit -m "feat(i18n): add dictionary types and translate()"
```

---

### Task 3: Провайдер языка

**Files:**
- Create: `frontend/src/i18n/LanguageProvider.tsx`
- Create: `frontend/src/i18n/useT.ts`
- Create: `frontend/src/__tests__/helpers/renderWithI18n.tsx`
- Test: `frontend/src/__tests__/i18n/LanguageProvider.test.tsx`

**Interfaces:**
- Consumes: `Locale`, `dirOf`, `isLocale`, `LANG_COOKIE`, `LANG_STORAGE_KEY`, `LANG_COOKIE_MAX_AGE` (Task 1); `DICTIONARIES`, `TKey` (Task 2); `translate` (Task 2); `getOrCreateUserId` из `@/lib/api`; `API_URL` из `@/lib/config`.
- Produces:
  ```ts
  export function LanguageProvider(props: { initialLocale: Locale; children: React.ReactNode }): JSX.Element;
  export function useT(): (key: TKey, vars?: TVars) => string;
  export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void; dir: "ltr" | "rtl" };
  // helpers
  export function renderWithI18n(ui: React.ReactElement, locale?: Locale): RenderResult;
  ```
  `useT` и `renderWithI18n` используются во всех задачах S1–S3.

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/i18n/LanguageProvider.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useT, useLocale } from "@/i18n/useT";

jest.mock("@/lib/api", () => ({ getOrCreateUserId: () => "session-test" }));

function Probe() {
  const t = useT();
  const { locale, setLocale, dir } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="text">{t("common.loading")}</span>
      <button onClick={() => setLocale("he")}>to hebrew</button>
    </div>
  );
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "lang=; path=/; max-age=0";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("starts at the locale handed down from the server", () => {
    render(
      <LanguageProvider initialLocale="ru">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
  });

  it("sets lang and dir on <html> for Hebrew", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
  });

  it("writes the choice to the cookie and to localStorage", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(document.cookie).toContain("lang=he");
    expect(window.localStorage.getItem("lang")).toBe("he");
  });

  it("pushes the choice to the backend", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings?userId=session-test"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("survives a backend that refuses the update", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(screen.getByTestId("locale")).toHaveTextContent("he");
  });

  it("adopts the localStorage value when the cookie is gone", async () => {
    window.localStorage.setItem("lang", "ru");
    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });
    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });

  it("throws a useful error when useT is called outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/LanguageProvider/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- i18n/LanguageProvider
```
Ожидается: FAIL — модуль `@/i18n/LanguageProvider` не найден.

- [ ] **Step 3: Реализовать провайдер**

Создать `frontend/src/i18n/LanguageProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  LANG_STORAGE_KEY,
  dirOf,
  isLocale,
  type Locale,
} from "./config";
import { DICTIONARIES, type TKey } from "./dictionaries";
import { translate } from "./translate";
import type { TVars } from "./types";
import { API_URL } from "@/lib/config";
import { getOrCreateUserId } from "@/lib/api";

export interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  dir: "ltr" | "rtl";
  t: (key: TKey, vars?: TVars) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

function writeCookie(locale: Locale): void {
  document.cookie = `${LANG_COOKIE}=${locale}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function hasCookie(): boolean {
  return document.cookie.split("; ").some((part) => part.startsWith(`${LANG_COOKIE}=`));
}

/** Fire-and-forget: the UI must switch language even when the backend is down. */
function pushToBackend(locale: Locale): void {
  try {
    const userId = getOrCreateUserId();
    void fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: locale }),
    }).catch(() => {});
  } catch {
    // getOrCreateUserId touches localStorage, which can throw in private mode
  }
}

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // private mode — the cookie below is enough
    }
    writeCookie(next);
    pushToBackend(next);
  }, []);

  // Keep the document in sync. The server already rendered the right values from
  // the cookie; this covers every switch after that.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  // The cookie is what the server reads, so it wins. localStorage is only
  // consulted when the cookie is missing — cleared site data, a new browser
  // profile — so a returning user does not silently fall back to English.
  useEffect(() => {
    if (hasCookie()) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      return;
    }
    if (isLocale(stored) && stored !== initialLocale) setLocale(stored);
    else writeCookie(initialLocale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      dir: dirOf(locale),
      t: (key: TKey, vars?: TVars) => translate(dict, locale, key, vars),
    };
  }, [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
```

- [ ] **Step 4: Реализовать хуки**

Создать `frontend/src/i18n/useT.ts`:

```ts
"use client";

import { useContext } from "react";
import { LanguageContext, type LanguageContextValue } from "./LanguageProvider";

function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <LanguageProvider>");
  return ctx;
}

/** Returns the translation function for the current locale. */
export function useT(): LanguageContextValue["t"] {
  return useLanguageContext().t;
}

/** Returns the current locale, the setter, and the writing direction. */
export function useLocale(): Omit<LanguageContextValue, "t"> {
  const { locale, setLocale, dir } = useLanguageContext();
  return { locale, setLocale, dir };
}
```

- [ ] **Step 5: Создать тестовую обёртку**

Создать `frontend/src/__tests__/helpers/renderWithI18n.tsx`:

```tsx
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import type { Locale } from "@/i18n/config";

/**
 * Renders a component inside the language provider.
 *
 * Every component test uses this instead of bare `render` — components read
 * their copy through useT(), which throws outside the provider.
 */
export function renderWithI18n(
  ui: ReactElement,
  locale: Locale = "en",
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>,
    ...options,
  });
}
```

- [ ] **Step 6: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- i18n/LanguageProvider
```
Ожидается: PASS, 7 тестов.

- [ ] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/i18n/LanguageProvider.tsx frontend/src/i18n/useT.ts \
        frontend/src/__tests__/helpers/renderWithI18n.tsx \
        frontend/src/__tests__/i18n/LanguageProvider.test.tsx
git commit -m "feat(i18n): add LanguageProvider, useT and test helper"
```

---

### Task 4: `<html lang dir>` из cookie

**Files:**
- Modify: `frontend/src/app/layout.tsx` (весь файл)

**Interfaces:**
- Consumes: `LANG_COOKIE`, `isLocale`, `dirOf`, `DEFAULT_LOCALE` (Task 1); `LanguageProvider` (Task 3).
- Produces: любой клиентский компонент под `app/` может звать `useT()`.

**Компромисс:** `cookies()` переводит корневой layout в dynamic rendering. Для этого приложения — чат за клиентским состоянием, `output: 'standalone'`, статической генерации нет — плата нулевая, а выигрыш в том, что `dir="rtl"` приходит в первом же HTML и вспышки LTR не бывает.

- [ ] **Step 1: Переписать layout**

Заменить содержимое `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { DEFAULT_LOCALE, LANG_COOKIE, dirOf, isLocale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "Travel Planning Agent",
  description: "AI-powered travel planning assistant with ReAct reasoning",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading the cookie here — rather than in a client effect — is what keeps
  // Hebrew from rendering left-to-right for one frame before hydration.
  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="antialiased">
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Проверить сборку**

```bash
npm run build --workspace=frontend
```
Ожидается: сборка проходит; корневой роут помечен как dynamic (`ƒ`) — это ожидаемо.

- [ ] **Step 3: Проверить руками**

```bash
npm run dev --workspace=frontend
```
Открыть `http://localhost:3000`, в консоли браузера выполнить
`document.cookie = "lang=he; path=/"`, перезагрузить страницу и убедиться, что
`document.documentElement.dir === "rtl"` уже в первом рендере (вкладка Network →
ответ документа содержит `dir="rtl"`).

- [ ] **Step 4: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
```

- [ ] **Step 5: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/app/layout.tsx
git commit -m "feat(i18n): render html lang/dir from the language cookie"
```

---

### Task 5: Переключатель языков

**Files:**
- Create: `frontend/src/components/shared/LanguageSwitcher.tsx`
- Modify: `frontend/src/app/page.tsx:74-106` (шапка)
- Modify: `frontend/src/app/settings/page.tsx:133-138` (шапка) и добавить секцию «Language»
- Modify: `frontend/src/app/calendar/page.tsx:183-188` (шапка)
- Modify: `frontend/src/app/features/page.tsx:89-94` (шапка)
- Test: `frontend/src/__tests__/components/LanguageSwitcher.test.tsx`

**Interfaces:**
- Consumes: `useLocale` (Task 3), `LOCALES`, `LOCALE_LABELS` (Task 1).
- Produces: `export default function LanguageSwitcher(): JSX.Element`.

**Почему в четырёх местах:** общего компонента шапки в проекте нет — у каждой страницы свой `<header>`. Извлечение `<AppHeader>` — постороннее для этой задачи изменение и в объём не входит.

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/components/LanguageSwitcher.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { renderWithI18n } from "../helpers/renderWithI18n";

jest.mock("@/lib/api", () => ({ getOrCreateUserId: () => "session-test" }));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "lang=; path=/; max-age=0";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("offers all three languages", () => {
    renderWithI18n(<LanguageSwitcher />);
    const select = screen.getByRole("combobox", { name: /language/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "עברית" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RU" })).toBeInTheDocument();
  });

  it("shows the active locale as selected", () => {
    renderWithI18n(<LanguageSwitcher />, "ru");
    expect(screen.getByRole("combobox", { name: /language/i })).toHaveValue("ru");
  });

  it("switches the document to right-to-left when Hebrew is picked", async () => {
    renderWithI18n(<LanguageSwitcher />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /language/i }), "he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.cookie).toContain("lang=he");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- LanguageSwitcher
```
Ожидается: FAIL — компонент не найден.

- [ ] **Step 3: Добавить ключи в словари**

В `frontend/src/i18n/locales/en.ts` ключ `"common.language": "Language"` уже есть из Task 2. Убедиться, что он же присутствует в `he.ts` и `ru.ts`.

- [ ] **Step 4: Реализовать компонент**

Создать `frontend/src/components/shared/LanguageSwitcher.tsx`:

```tsx
"use client";

import { LOCALES, LOCALE_LABELS, isLocale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/useT";

/**
 * Native <select> rather than a custom dropdown: it is keyboard- and
 * screen-reader-correct for free, and it is the one control on the page whose
 * options must stay readable while the surrounding text direction flips.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <select
      aria-label={t("common.language")}
      value={locale}
      onChange={(e) => {
        if (isLocale(e.target.value)) setLocale(e.target.value);
      }}
      className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded px-1.5 py-1 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 5: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- LanguageSwitcher
```
Ожидается: PASS, 3 теста.

- [ ] **Step 6: Вставить переключатель в четыре шапки**

В `frontend/src/app/page.tsx` добавить импорт `import LanguageSwitcher from "@/components/shared/LanguageSwitcher";` и вставить `<LanguageSwitcher />` в правый блок шапки — первым элементом внутри `<div className="flex items-center gap-2 sm:gap-3 shrink-0">`, перед `<span>` с идентификатором сессии.

В `frontend/src/app/settings/page.tsx`, `frontend/src/app/calendar/page.tsx` и `frontend/src/app/features/page.tsx` добавить тот же импорт и вставить `<LanguageSwitcher />` последним элементом внутри `<header>`, добавив на заголовок внутри шапки класс `me-auto`, чтобы переключатель прижался к концу строки.

- [ ] **Step 7: Добавить секцию языка в настройки**

В `frontend/src/app/settings/page.tsx` добавить перед секцией провайдера календаря блок:

```tsx
<section className="bg-white border border-gray-200 rounded-lg p-4">
  <h2 className="text-sm font-semibold text-gray-800 mb-3">{t("common.language")}</h2>
  <LanguageSwitcher />
</section>
```

Классы контейнера скопировать с соседней секции на этой же странице, чтобы блок не выбивался из общего вида.

- [ ] **Step 8: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
npm run build --workspace=frontend
```

- [ ] **Step 9: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/components/shared/LanguageSwitcher.tsx \
        frontend/src/__tests__/components/LanguageSwitcher.test.tsx \
        frontend/src/app/page.tsx frontend/src/app/settings/page.tsx \
        frontend/src/app/calendar/page.tsx frontend/src/app/features/page.tsx
git commit -m "feat(i18n): add language switcher to every page header"
```

---

### Task 6: Перенос английских строк в словарь

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`, `he.ts`, `ru.ts` (пополнение ключами)
- Modify: все файлы из таблицы ниже
- Modify: `frontend/src/__tests__/components/*.test.tsx` (замена `render` на `renderWithI18n`)

**Interfaces:**
- Consumes: `useT` (Task 3).
- Produces: пополненный `TKey`; ключи, которые S3 переводит на иврит и русский.

**Правило переноса** — механическое, без творчества:

1. Ключ = `<namespace>.<camelCase смысла>`, где namespace берётся из таблицы ниже.
2. Значение в `en.ts` = **точная английская строка из исходного файла**, символ в символ, включая многоточия (`…`, не `...`) и регистр.
3. В `he.ts` и `ru.ts` добавляется тот же ключ с **тем же английским значением** — перевод это S3. Компилятор не даст забыть ключ.
4. Строка со вставкой числа или имени превращается в шаблон с `{name}`; если число управляет формой слова — значение объявляется `as PluralForms`.
5. `aria-label`, `title`, `placeholder` и текст в `alert()` переносятся наравне с видимым текстом.
6. Строки, которые **не** переносятся: `console.log`/`console.error`, ключи localStorage, `data-testid`, имена CSS-классов, значения `agentType`.

**Namespace по файлам:**

| Файл | Namespace | Ожидаемо строк |
|---|---|---|
| `src/app/page.tsx` | `common.*` | ~7 |
| `src/app/features/page.tsx` | `features.*` | ~50 |
| `src/app/settings/page.tsx` | `settings.*` | ~50 |
| `src/app/calendar/page.tsx` | `calendar.*` | ~20 |
| `src/components/chat/ChatWindow.tsx` | `chat.*` | ~12 |
| `src/components/chat/MessageBubble.tsx` | `chat.*` | ~14 |
| `src/components/chat/AgentThoughts.tsx` | `chat.*` | ~5 |
| `src/components/memory/MemoryPanel.tsx` | `memory.*` | ~13 |
| `src/components/conversations/ConversationList.tsx` | `conversations.*` | ~4 |
| `src/components/shared/AgentSelector.tsx` | `common.*` | ~2 |
| `src/components/shared/ErrorBoundary.tsx` | `errors.*` | ~1 |
| `src/hooks/useAsync.ts`, `useFileAttachments.ts`, `useStreamChat.ts`, `useVoiceRecording.ts` | `errors.*` | ~5 суммарно |
| `src/lib/api.ts`, `settingsApi.ts` | `errors.*` | ~14 суммарно |

`src/lib/dateUtils.ts`, `src/lib/fileUtils.ts` и `src/data/starterSuggestions.ts` в этой задаче **не трогаются** — они переводятся на `Intl` в S3.

**Хуки и `lib/*` — не компоненты**, `useT()` в них не вызвать. Их строки переносятся так: функция возвращает ключ (`throw new Error("errors.uploadTooLarge")` → место обработки переводит), либо принимает уже переведённый текст параметром. Конкретный выбор для каждого файла — в шагах ниже.

- [ ] **Step 1: Переписать тесты компонентов на обёртку**

В каждом из пяти существующих файлов `frontend/src/__tests__/components/*.test.tsx` заменить импорт и вызовы:

```tsx
// было
import { render, screen } from "@testing-library/react";
render(<Component ... />);

// стало
import { screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/renderWithI18n";
renderWithI18n(<Component ... />);
```

Ассерты на английский текст **не меняются** — словарь `en` содержит те же строки.

- [ ] **Step 2: Убедиться, что тесты по-прежнему зелёные**

```bash
npm run test --workspace=frontend
```

Ожидается: PASS. Это контрольный шаг, а не красная фаза: обёртка добавлена, но
компоненты ещё берут текст из литералов, поэтому ассерты обязаны сойтись без
единой правки. Если что-то падает — `renderWithI18n` подключена неверно, чинить
до перехода к Step 3, иначе дальше будет не отличить поломку обёртки от поломки
переноса строк.

- [ ] **Step 3: Перенести строки, файл за файлом**

Порядок — от самых мелких к самым крупным, чтобы механика отладилась на дешёвых файлах. После **каждого** файла прогонять `npm run test --workspace=frontend`.

- [ ] `src/components/shared/ErrorBoundary.tsx` → `errors.boundaryFallback`
- [ ] `src/components/shared/AgentSelector.tsx` → `common.agentTravel`, `common.agentShopping`
- [ ] `src/components/conversations/ConversationList.tsx` → `conversations.*`
- [ ] `src/components/chat/AgentThoughts.tsx` → `chat.*` (счётчик инструментов — `as PluralForms`)
- [ ] `src/components/chat/MessageBubble.tsx` → `chat.*`
- [ ] `src/components/chat/ChatWindow.tsx` → `chat.*`
- [ ] `src/components/memory/MemoryPanel.tsx` → `memory.*` (счётчик записей — `as PluralForms`)
- [ ] `src/app/page.tsx` → `common.*`
- [ ] `src/app/calendar/page.tsx` → `calendar.*`
- [ ] `src/app/settings/page.tsx` → `settings.*`
- [ ] `src/app/features/page.tsx` → `features.*`

Пример переноса — `ErrorBoundary.tsx`. Компонент классовый, хука в нём не вызвать, поэтому текст приходит пропом со значением по умолчанию:

```tsx
// было
<div className="...">Something went wrong.</div>

// стало — в родителе
<ErrorBoundary fallback={t("errors.boundaryFallback")}>

// и в самом компоненте
interface Props { children: ReactNode; fallback?: string }
// ...
<div className="...">{this.props.fallback ?? "Something went wrong."}</div>
```

Английский литерал остаётся дефолтом: граница ошибок обязана работать даже когда сломался сам провайдер.

- [ ] **Step 4: Перенести строки хуков и `lib/*`**

`src/hooks/useFileAttachments.ts` и `useVoiceRecording.ts` вызывают `alert()` с английским текстом. Заменить: хук принимает `t` параметром от вызывающего компонента.

```ts
// было
export function useFileAttachments() {
  // ...
  alert("File is too large (max 5 MB)");

// стало
import type { TKey, TVars } from "@/i18n/dictionaries";
export function useFileAttachments(t: (key: TKey, vars?: TVars) => string) {
  // ...
  alert(t("errors.fileTooLarge", { max: 5 }));
```

Вызов в `ChatWindow.tsx`: `useFileAttachments(t)`.

`src/lib/api.ts` и `src/lib/settingsApi.ts` — модули без React. Их `throw new Error("...")` меняется на `throw new Error("errors.<key>")`, а место, которое ловит ошибку и показывает её пользователю, переводит через `t(err.message as TKey)`. Если ключ в словаре отсутствует, `translate` вернёт сам ключ — это заметно при отладке и не роняет UI.

- [ ] **Step 5: Проверить, что английских строк не осталось**

```bash
grep -rnE '"[A-Z][a-z]+ [a-z]' frontend/src/components frontend/src/app --include='*.tsx' \
  | grep -v 'className' | grep -v '//'
```
Ожидается: пусто либо только осознанные исключения (дефолт `ErrorBoundary`).

- [ ] **Step 6: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
npm run build --workspace=frontend
```

- [ ] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src
git commit -m "refactor(i18n): move all UI copy into the en dictionary"
```

---

### Task 7: Подхват языка с сервера при первом заходе

**Files:**
- Modify: `frontend/src/i18n/LanguageProvider.tsx`
- Test: `frontend/src/__tests__/i18n/LanguageProvider.test.tsx` (дополнение)

**Interfaces:**
- Consumes: `GET /api/settings` из S0 Task 3.
- Produces: ничего нового.

**Зачем:** пользователь мог выбрать иврит в Telegram-боте, а на web зайти с чистого браузера. Cookie нет, `localStorage` пуст — язык надо взять с сервера. Локальный выбор при этом остаётся главным: если cookie есть, серверное значение игнорируется.

- [ ] **Step 1: Дописать падающий тест**

Добавить в `frontend/src/__tests__/i18n/LanguageProvider.test.tsx`:

```tsx
  it("adopts the server-side language on a first visit with no cookie", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ language: "he" }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("he");
  });

  it("ignores the server-side language when a cookie is already set", async () => {
    document.cookie = "lang=ru; path=/";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ language: "he" }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="ru">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- i18n/LanguageProvider
```
Ожидается: FAIL на первом из двух новых тестов — провайдер не ходит в `/api/settings`.

- [ ] **Step 3: Дополнить эффект в провайдере**

Заменить второй `useEffect` в `LanguageProvider.tsx`:

```tsx
  // The cookie is what the server reads, so it wins. Without one — cleared site
  // data, a new browser, a user who picked Hebrew in the Telegram bot — fall back
  // to localStorage, then to whatever the backend has stored for this session.
  useEffect(() => {
    if (hasCookie()) return;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      stored = null;
    }

    if (isLocale(stored)) {
      if (stored !== initialLocale) setLocale(stored);
      else writeCookie(initialLocale);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const userId = getOrCreateUserId();
        const res = await fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const data: { language?: unknown } = await res.json();
        if (cancelled) return;
        if (isLocale(data.language) && data.language !== initialLocale) setLocale(data.language);
        else writeCookie(initialLocale);
      } catch {
        // offline or no backend — the default locale is already rendered
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Убедиться, что тесты проходят**

```bash
npm run test --workspace=frontend -- i18n/LanguageProvider
```
Ожидается: PASS, 9 тестов.

- [ ] **Step 5: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
```

- [ ] **Step 6: Обновить SKILL.md**

Добавить рецепт `add-ui-string`: куда класть ключ, почему нужно добавить его во все три словаря, что компилятор ловит пропуск.

- [ ] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/i18n/LanguageProvider.tsx \
        frontend/src/__tests__/i18n/LanguageProvider.test.tsx SKILL.md
git commit -m "feat(i18n): adopt the server-side language on a cookieless first visit"
```

---

### Task 8: Browser language as the default for a new visitor

*(Added 2026-08-28, after S1 shipped, and revised the same day after code
review. Written in English per the project rule that specs, plans and technical
docs are English.)*

**Files:**
- Create: `backend-langgraph/src/db/migrations/016_language_nullable.sql`
- Modify: `backend-langgraph/src/repositories/UserPreferencesRepository.ts`
- Create: `frontend/src/i18n/detectLocale.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/i18n/LanguageProvider.tsx`
- Modify: `frontend/src/__tests__/helpers/renderWithI18n.tsx`
- Test: `frontend/src/__tests__/i18n/detectLocale.test.ts` (new)
- Test: `frontend/src/__tests__/i18n/LanguageProvider.test.tsx` (extend)
- Test: `backend-langgraph/tests/integration/userPreferences.test.ts` (extend)

**Interfaces:**
- Consumes: `Locale`, `isLocale`, `DEFAULT_LOCALE` (Task 1); `setLocale` (Task 3).
- Produces: `parseAcceptLanguage(header)`, `pickLocale(tags)`,
  `browserLocale(): Locale | null`, `acceptLanguageLocale(header): Locale | null`;
  a new optional `headerLocale` prop on `LanguageProvider`;
  `UserPreferences.language` widens to `Locale | null`.

**Why:** `DEFAULT_LOCALE` is `en`, so a first-time Hebrew or Russian speaker
lands on an English page and has to find a switcher labelled in a language they
may not read. The browser already knows which language they want.

**Resolution order** (first source naming a supported locale wins):
`lang` cookie -> `localStorage.lang` -> `GET /api/settings` ->
`Accept-Language` -> `navigator.language(s)` -> `en`. The first three are
explicit choices and outrank the browser; a user who chose Hebrew in the
Telegram bot keeps Hebrew even on an English-configured browser.

**Why the header outranks navigator.** `Accept-Language` is the visitor saying
which language they want content in; `navigator.language` only reports the
language the browser's interface is in, and the two can differ. The header is
also the only reading that arrives before hydration, so deriving the default
from `navigator` alone would show one frame of LTR English to every Hebrew
first-time visitor — the flash Task 4 exists to prevent. `navigator` is the
fallback for a header that was stripped or names nothing we support.

The layout passes its header reading to the provider as a separate prop rather
than letting the provider infer it from the rendered locale: `en` from a header
and `en` from no header are different facts, and only the second leaves
`navigator` anything to decide.

**Why the migration.** 015 shipped `language` as `NOT NULL DEFAULT 'en'`, which
makes "never chose" and "chose English" identical on the wire. Step 3 would then
hand every Hebrew visitor a defaulted `'en'` and switch them to English — worse
than having no detection at all. 016 drops the default and the NOT NULL so
`NULL` can mean "not chosen".

**Persistence.** Once detected, the language is written to the cookie, to
`localStorage` and to `POST /api/settings` exactly like an explicit choice, so
`/settings`, the Telegram bot and push all speak it from the first visit and
later sessions read it back. The exception is a backend that never answered:
the language still applies to the page, but writing the cookie would pin the
guess — the server reads the cookie on every later visit, so the effect would
never run again and a language stored elsewhere would never get its turn.

- [ ] **Step 1: Make "not chosen" representable**

Create `backend-langgraph/src/db/migrations/016_language_nullable.sql`:

```sql
ALTER TABLE user_service_preferences
  ALTER COLUMN language DROP DEFAULT;

ALTER TABLE user_service_preferences
  ALTER COLUMN language DROP NOT NULL;
```

Both statements are idempotent. The CHECK from 015 still holds — `NULL IN (...)`
is NULL, not FALSE, so a null passes it untouched.

In `UserPreferencesRepository.ts`: `UserPreferences.language` becomes
`Locale | null`, `DEFAULTS.language` becomes `null`, `get()` maps the row with
`isLocale(row.language) ? row.language : null`, and the INSERT drops its
`COALESCE($7, 'en')` in favour of a bare `$7` so a row created for other
settings does not silently claim English.

- [ ] **Step 2: Prove the distinction survives a round trip**

Extend `backend-langgraph/tests/integration/userPreferences.test.ts` — the two
existing "defaults to English" cases become "reports no language" / "leaves the
language unset", plus:

```ts
  itDb('keeps an explicit English apart from an absent language', async () => {
    await repo.save('session-explicit-en', { language: 'en' });
    await repo.save('session-implicit', { calendarProvider: 'apple' });

    expect((await repo.get('session-explicit-en')).language).toBe('en');
    expect((await repo.get('session-implicit')).language).toBeNull();
  });
```

Run: `TEST_DATABASE_URL=... npm run test:all --workspace=backend-langgraph`

- [ ] **Step 3: Write the failing tests for the parser**

Create `frontend/src/__tests__/i18n/detectLocale.test.ts` covering: an absent
header yields `[]`; q-weights order the tags (`en;q=0.9, he` -> Hebrew first);
equal weights keep written order; `q=0` and a malformed weight drop the tag;
`he-IL`, `HE-il` and the legacy `iw-IL` all select Hebrew; an unsupported tag is
skipped; nothing matching yields `null`; `browserLocale` prefers
`navigator.languages` and falls back to `navigator.language`;
`acceptLanguageLocale` returns `null` rather than claiming English.

- [ ] **Step 4: Run them and watch them fail**

```bash
npm run test --workspace=frontend -- i18n/detectLocale
```
Expected: FAIL — `Cannot find module '@/i18n/detectLocale'`.

- [ ] **Step 5: Write the module**

`frontend/src/i18n/detectLocale.ts` exports `parseAcceptLanguage` (splits on
commas, reads `;q=`, drops zero and unparseable weights, sorts descending),
`pickLocale` (primary subtag, lowercased, `iw` aliased to `he`),
`browserLocale` and `acceptLanguageLocale`. Both readings funnel through
`pickLocale` so they cannot drift apart, and both return `Locale | null` — "asked
for English" and "asked for nothing" are different facts.

- [ ] **Step 6: Read the header in the root layout**

```tsx
  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value;
  const chosen = isLocale(raw) ? raw : null;

  const fromHeader = chosen ? null : acceptLanguageLocale((await headers()).get("accept-language"));
  const locale = chosen ?? fromHeader ?? DEFAULT_LOCALE;

  // …
  <LanguageProvider initialLocale={locale} headerLocale={fromHeader}>
```

`headers()` costs nothing extra — `cookies()` already forces this layout into
dynamic rendering (spec 4.3).

- [ ] **Step 7: Extend the provider effect**

Add the optional `headerLocale?: Locale | null` prop, then replace the async
block inside the cookieless effect:

```tsx
      let answered = false;
      let saved: Locale | null = null;
      try {
        const res = await fetch(`${API_URL}/api/settings?userId=${…}`);
        if (res.ok) {
          answered = true;
          const data: { language?: unknown } = await res.json();
          if (isLocale(data.language)) saved = data.language;
        }
      } catch {
        // offline or no backend — the browser's own language still applies
      }
      if (cancelled) return;

      const next = saved ?? headerLocale ?? browserLocale() ?? initialLocale;

      if (answered) setLocale(next);
      else if (next !== initialLocale) setLocaleState(next);
```

`setLocale` even when `next` equals the rendered locale: that call is what
writes it to the backend, and skipping it is exactly the bug review caught.

- [ ] **Step 8: Give `renderWithI18n` the cookie its locale implies**

The helper renders a locale with no cookie, which the provider now correctly
treats as an unverified guess and re-derives — in jsdom that means `en-US`, so
a component asked for in Hebrew renders in English and the RTL tests fail. Set
`document.cookie = \`${LANG_COOKIE}=${locale}; path=/\`` in the helper: a browser
showing that locale would have it.

- [ ] **Step 9: Extend the provider tests**

Cover: nothing stored anywhere -> browser language; the detected language is
written to cookie, `localStorage` and `POST /api/settings`; **the language the
server read from the header is stored too** (the review regression: with the
server already resolving Hebrew, nothing on the client fired and the database
never learned it); a stored choice outranks both readings; the header outranks
`navigator`; `navigator` covers a missing header; neither naming a supported
language leaves the rendered locale alone; an unreachable backend applies the
language but writes no cookie.

- [ ] **Step 10: Full check**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL=… npm run test:all --workspace=backend-langgraph
cd frontend && npx tsc --noEmit && npx jest && npm run lint && npm run build
```

Then confirm the first paint against a running server, with no cookie:

```bash
curl -s -H 'Accept-Language: he-IL,he;q=0.9' localhost:3010 | grep -o '<html[^>]*>'
```
Expected: `<html lang="he" dir="rtl">`. Also check `ru-RU` -> ru, a French-only
header -> en, `en;q=0.5, he;q=0.9` -> he, and that a `lang=ru` cookie beats an
`Accept-Language` of he.

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(i18n): default a new visitor to their browser's language"
```

---

## Определение готовности S1

- [ ] `npm run test --workspace=frontend` — зелёный, включая ~25 новых тестов
- [ ] `npx tsc -p frontend/tsconfig.json --noEmit` — чисто
- [ ] `npm run build --workspace=frontend` — проходит
- [ ] В четырёх шапках виден переключатель языков
- [ ] Выбор иврита ставит `lang="he" dir="rtl"` на `<html>` и переживает перезагрузку
- [ ] Выбор языка виден в `GET /api/settings?userId=…`
- [ ] A first visit from a Hebrew-configured browser renders Hebrew, and the detected language is visible in `GET /api/settings?userId=…`
- [ ] В `frontend/src/components` и `frontend/src/app` не осталось захардкоженных пользовательских строк, кроме дефолта `ErrorBoundary`
- [ ] `/code-review` пройден, находки закрыты, отчёт по осям Standards / Spec

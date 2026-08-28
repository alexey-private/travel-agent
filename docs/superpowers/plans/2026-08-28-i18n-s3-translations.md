# S3 — Переводы на иврит и русский, форматирование через Intl

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Словари `he` и `ru` содержат настоящие переводы, даты и размеры файлов форматируются по локали, а стартовые подсказки написаны на языке пользователя — не переведены с английского машинально.

**Architecture:** Словари уже существуют и типизированы (S1), поэтому эта подзадача — заполнение значений плюс перевод трёх модулей с ручного форматирования на `Intl`. Стартовые подсказки — особый случай: это не UI-строки, а сообщения, уходящие в LLM, поэтому для каждого языка пишется собственный набор запросов, а не перевод английского.

**Tech Stack:** TypeScript, `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.PluralRules`.

**Spec:** [2026-08-28-i18n-hebrew-design.md](../specs/2026-08-28-i18n-hebrew-design.md) — §4.6, §4.7.

## Global Constraints

См. [индекс планов](2026-08-28-i18n-hebrew-index.md#global-constraints). Важное именно здесь:

- Ключи словарей **не добавляются и не переименовываются** — только заполняются значения. Новый ключ означает, что S1 что-то упустил; это чинится в S1, а не здесь.
- Иврит пишется в логическом порядке (как набирается), а не в визуальном. Разворачивать строки руками не нужно — это делает браузер.
- Английские названия остаются английскими внутри переводов: `Google`, `Apple`, `iCloud`, `Telegram`, `Voyage AI`, коды валют, IATA-коды.
- Коммиты — только по явному разрешению пользователя.

---

### Task 1: Форматирование дат по локали

**Files:**
- Modify: `frontend/src/lib/dateUtils.ts` (весь файл)
- Modify: `frontend/src/components/conversations/ConversationList.tsx` (вызов `formatDate`)
- Test: `frontend/src/__tests__/lib/dateUtils.test.ts`

**Interfaces:**
- Consumes: `Locale` из S1 Task 1.
- Produces:
  ```ts
  export function formatDate(iso: string, locale: Locale, now?: Date): string;
  ```
  Параметр `now` существует ради тестируемости — без него «вчера» проверить нельзя.

**Что не так сейчас:** `toLocaleDateString([])` берёт локаль браузера, а не языка
приложения. Пользователь с ивритским интерфейсом в браузере на английском видит
английские дни недели. Плюс строка `"Yesterday"` захардкожена.

- [x] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/lib/dateUtils.test.ts`:

```ts
import { formatDate } from "@/lib/dateUtils";

const NOW = new Date("2026-08-28T12:00:00Z");
const iso = (d: string) => new Date(d).toISOString();

describe("formatDate", () => {
  it("shows the time for today", () => {
    const out = formatDate(iso("2026-08-28T09:30:00Z"), "en", NOW);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("says yesterday in English", () => {
    expect(formatDate(iso("2026-08-27T09:30:00Z"), "en", NOW)).toBe("yesterday");
  });

  it("says yesterday in Hebrew", () => {
    expect(formatDate(iso("2026-08-27T09:30:00Z"), "he", NOW)).toBe("אתמול");
  });

  it("says yesterday in Russian", () => {
    expect(formatDate(iso("2026-08-27T09:30:00Z"), "ru", NOW)).toBe("вчера");
  });

  it("shows a weekday name inside the last week, in the requested locale", () => {
    const en = formatDate(iso("2026-08-25T09:30:00Z"), "en", NOW);
    const he = formatDate(iso("2026-08-25T09:30:00Z"), "he", NOW);
    expect(en).not.toBe(he);
    expect(he).toMatch(/[֐-׿]/);
  });

  it("shows month and day beyond a week, in the requested locale", () => {
    const ru = formatDate(iso("2026-07-01T09:30:00Z"), "ru", NOW);
    expect(ru).toMatch(/[Ѐ-ӿ]/);
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- dateUtils
```
Ожидается: FAIL — `formatDate` принимает один аргумент.

- [x] **Step 3: Переписать модуль**

Заменить содержимое `frontend/src/lib/dateUtils.ts`:

```ts
import type { Locale } from "@/i18n/config";

/**
 * Formats a message timestamp the way a chat list does: time today, "yesterday"
 * yesterday, a weekday name inside the week, month and day beyond that.
 *
 * The locale is passed in rather than read from the browser: the interface
 * language and the browser language are different things, and a user reading
 * Hebrew should not get English weekday names.
 *
 * `now` is injectable so the relative branches are testable.
 */
export function formatDate(iso: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  if (diffDays === 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
  }

  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}
```

- [x] **Step 4: Обновить вызывающий компонент**

В `frontend/src/components/conversations/ConversationList.tsx` получить локаль
и передать её:

```tsx
import { useLocale } from "@/i18n/useT";
// ...
  const { locale } = useLocale();
// ...
  {formatDate(c.created_at, locale)}
```

- [x] **Step 5: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- dateUtils
```
Ожидается: PASS, 6 тестов.

Если строки «вчера» из `Intl.RelativeTimeFormat` в среде Node отличаются от
ожидаемых (`yesterday` / `אתמול` / `вчера`) — проверить, что Node собран с полным
ICU (`node -e "console.log(process.versions.icu)"`). Node 22 из `.nvmrc` проекта
идёт с full-icu; если ICU урезан, тест поправить нельзя — надо чинить окружение.

- [x] **Step 6: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/lib/dateUtils.ts \
        frontend/src/components/conversations/ConversationList.tsx \
        frontend/src/__tests__/lib/dateUtils.test.ts
git commit -m "feat(i18n): format dates with the app locale instead of the browser locale"
```

---

### Task 2: Форматирование размеров файлов

**Files:**
- Modify: `frontend/src/lib/fileUtils.ts:6-10` (функция `formatBytes`)
- Modify: вызывающие места (`frontend/src/components/chat/ChatWindow.tsx`, `frontend/src/hooks/useFileAttachments.ts`)
- Test: `frontend/src/__tests__/lib/fileUtils.test.ts`

**Interfaces:**
- Consumes: `Locale` из S1 Task 1.
- Produces:
  ```ts
  export function formatBytes(bytes: number, locale: Locale): string;
  ```

- [x] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/lib/fileUtils.test.ts`:

```ts
import { formatBytes } from "@/lib/fileUtils";

describe("formatBytes", () => {
  it("keeps small sizes in bytes", () => {
    expect(formatBytes(512, "en")).toMatch(/512/);
  });

  it("switches to kilobytes", () => {
    expect(formatBytes(2048, "en")).toMatch(/2/);
    expect(formatBytes(2048, "en")).not.toMatch(/2048/);
  });

  it("switches to megabytes with one decimal", () => {
    expect(formatBytes(3_500_000, "en")).toMatch(/3\.3/);
  });

  it("uses the locale's decimal separator and unit label", () => {
    expect(formatBytes(3_500_000, "ru")).toMatch(/3,3\s*МБ/);
  });

  it("uses the Hebrew unit label where CLDR has one", () => {
    expect(formatBytes(512, "he")).toMatch(/[֐-׿]/);
  });

  // CLDR gives Hebrew no abbreviation of its own for kB/MB — Hebrew writes them
  // in Latin, the way it writes Google and Telegram.
  it("keeps the Latin abbreviation Hebrew itself uses for larger units", () => {
    expect(formatBytes(3_500_000, "he")).toMatch(/3\.3\s*MB/);
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- fileUtils
```
Ожидается: FAIL — `formatBytes` принимает один аргумент.

- [x] **Step 3: Переписать функцию**

В `frontend/src/lib/fileUtils.ts` заменить `formatBytes`, добавив импорт типа:

```ts
import type { Locale } from "@/i18n/config";

/**
 * Human-readable attachment size.
 *
 * Intl.NumberFormat with a unit style carries both the separator and the unit
 * label, so Russian gets "3,3 МБ" without a hand-written table per language.
 * Where a language has no abbreviation of its own — Hebrew writes kB and MB in
 * Latin — CLDR leaves the Latin one, which is the right answer for that reader.
 */
export function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < 1024) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "byte", unitDisplay: "short" }).format(bytes);
  }
  if (bytes < 1024 * 1024) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "kilobyte",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(bytes / 1024);
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024));
}
```

- [x] **Step 4: Обновить вызывающие места**

Найти вызовы и передать локаль:

```bash
grep -rn "formatBytes" frontend/src
```

В компонентах локаль берётся через `useLocale()`; в `useFileAttachments.ts` она
приходит параметром хука — там же, где уже передаётся `t` (S1 Task 6 Step 4).

- [x] **Step 5: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- fileUtils
```
Ожидается: PASS, 6 тестов.

- [x] **Step 6: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/lib/fileUtils.ts frontend/src/components frontend/src/hooks \
        frontend/src/__tests__/lib/fileUtils.test.ts
git commit -m "feat(i18n): format attachment sizes with Intl.NumberFormat"
```

---

### Task 3: Локализованные стартовые подсказки

**Files:**
- Modify: `frontend/src/data/starterSuggestions.ts` (весь файл)
- Modify: вызывающее место в `frontend/src/components/chat/ChatWindow.tsx`
- Test: `frontend/src/__tests__/lib/starterSuggestions.test.ts` (существующий, расширяется)

**Interfaces:**
- Consumes: `Locale` из S1 Task 1.
- Produces:
  ```ts
  export function getRandomSuggestions(count: number, agentType: "travel" | "shopping", locale: Locale): string[];
  export const ALL_SUGGESTIONS: Record<Locale, Record<"travel" | "shopping", string[]>>;
  ```

**Почему это не перевод:** подсказка одновременно подпись кнопки и текст,
уходящий в LLM как сообщение пользователя. Дословный перевод английской фразы
даёт неестественный запрос и тянет за собой англоцентричные примеры («flights
from New York to Rome» для ивритоязычного пользователя). Для каждого языка
пишется собственный набор — тот же список инструментов, но свои маршруты,
города и валюты.

- [x] **Step 1: Написать падающий тест**

Заменить содержимое `frontend/src/__tests__/lib/starterSuggestions.test.ts`:

```ts
import { ALL_SUGGESTIONS, getRandomSuggestions } from "@/data/starterSuggestions";
import { LOCALES } from "@/i18n/config";

describe("starter suggestions", () => {
  it("covers every locale and both agents", () => {
    for (const locale of LOCALES) {
      expect(ALL_SUGGESTIONS[locale].travel.length).toBeGreaterThanOrEqual(20);
      expect(ALL_SUGGESTIONS[locale].shopping.length).toBeGreaterThanOrEqual(16);
    }
  });

  it("writes Hebrew suggestions in Hebrew", () => {
    for (const s of ALL_SUGGESTIONS.he.travel) {
      expect(s).toMatch(/[֐-׿]/);
    }
  });

  it("writes Russian suggestions in Cyrillic", () => {
    for (const s of ALL_SUGGESTIONS.ru.shopping) {
      expect(s).toMatch(/[Ѐ-ӿ]/);
    }
  });

  it("returns the requested number of distinct suggestions", () => {
    const picked = getRandomSuggestions(4, "travel", "he");
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
  });

  it("never returns more than the pool holds", () => {
    const picked = getRandomSuggestions(1000, "shopping", "ru");
    expect(picked.length).toBe(ALL_SUGGESTIONS.ru.shopping.length);
  });

  it("names the current month in the locale's own language", () => {
    const he = ALL_SUGGESTIONS.he.travel.join(" ");
    expect(he).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- starterSuggestions
```
Ожидается: FAIL — `ALL_SUGGESTIONS` не разбит по локалям.

- [x] **Step 3: Переписать модуль**

Заменить содержимое `frontend/src/data/starterSuggestions.ts`:

```ts
import type { Locale } from "@/i18n/config";

export type SuggestionAgent = "travel" | "shopping";

/** Month name in the given locale, offset from today. Used inside suggestion text. */
function monthName(locale: Locale, offsetMonths = 0): string {
  const d = new Date();
  // Day 1 first: setMonth on the 31st overflows into the month after the one
  // asked for, so "in two months" would skip a month for three days each year.
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(d);
}

function englishSuggestions(): Record<SuggestionAgent, string[]> {
  return {
    travel: [
      `Find flights from New York to Rome in ${monthName("en", 2)}`,
      "Cheapest flights from London to Bangkok next month",
      // …остальные 20 фраз переносятся из текущего файла без изменений
    ],
    shopping: [
      "Find me the best noise-cancelling headphones under $200",
      // …остальные 17 фраз переносятся из текущего файла без изменений
    ],
  };
}

function hebrewSuggestions(): Record<SuggestionAgent, string[]> {
  return {
    travel: [
      `מצא טיסות מתל אביב לרומא ב${monthName("he", 2)}`,
      "הטיסות הזולות ביותר מתל אביב לבנגקוק בחודש הבא",
      // …
    ],
    shopping: [
      "מצא אוזניות מבטלות רעש עד 800 ש\"ח",
      // …
    ],
  };
}

function russianSuggestions(): Record<SuggestionAgent, string[]> {
  return {
    travel: [
      `Найди рейсы из Тель-Авива в Рим в ${monthName("ru", 2)}`,
      // …
    ],
    shopping: [
      "Подбери наушники с шумоподавлением до 200 долларов",
      // …
    ],
  };
}

export const ALL_SUGGESTIONS: Record<Locale, Record<SuggestionAgent, string[]>> = {
  en: englishSuggestions(),
  he: hebrewSuggestions(),
  ru: russianSuggestions(),
};

export function getRandomSuggestions(
  count: number,
  agentType: SuggestionAgent = "travel",
  locale: Locale = "en",
): string[] {
  // Fisher-Yates rather than sort(() => Math.random() - 0.5): that comparator is
  // inconsistent, which the spec leaves undefined, and it skews heavily towards
  // leaving items near where they started.
  const pool = [...ALL_SUGGESTIONS[locale][agentType]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
```

- [x] **Step 4: Написать наборы полностью**

Английский набор — перенести все 22 travel и 18 shopping фраз из текущего файла
дословно, заменив `monthName(2)` на `monthName("en", 2)`.

Ивритский и русский наборы — написать заново, покрывая тот же список
инструментов, что и английский (комментарии `// search_flights`,
`// search_hotels` и т. д. в исходном файле показывают, какой инструмент
провоцирует каждая пара фраз). Требования к каждому набору:

- по 2 фразы на инструмент, как в английском
- 22 travel и 18 shopping в каждом языке
- маршруты и валюты, естественные для языка: для иврита — вылеты из Тель-Авива,
  цены в шекелях; для русского — вылеты из Тель-Авива, цены в долларах
- месяц в русской фразе ставится после «на», а не «в»: `Intl` возвращает
  именительный падеж, который совпадает с винительным, но не с предложным
- никаких английских слов, кроме названий брендов и моделей товаров
  (`Sony WH-1000XM5`, `AirPods Pro`, `Kindle Paperwhite`)

- [x] **Step 5: Обновить вызывающее место**

В `frontend/src/components/chat/ChatWindow.tsx` передать локаль:

```tsx
  const { locale } = useLocale();
  // ...
  getRandomSuggestions(4, agentType, locale)
```

- [x] **Step 6: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- starterSuggestions
```
Ожидается: PASS, 6 тестов.

- [x] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/data/starterSuggestions.ts \
        frontend/src/components/chat/ChatWindow.tsx \
        frontend/src/__tests__/lib/starterSuggestions.test.ts
git commit -m "feat(i18n): write per-locale starter suggestions"
```

---

### Task 4: Перевод словарей

**Files:**
- Modify: `frontend/src/i18n/locales/he.ts` (все значения)
- Modify: `frontend/src/i18n/locales/ru.ts` (все значения)
- Test: `frontend/src/__tests__/i18n/dictionaries.test.ts`
- Test: `frontend/src/__tests__/components/LanguageSwitcher.test.tsx` — ищет
  переключатель по английскому `/language/i`; как только `common.language`
  переведён, поиск ломается на he и ru. Ярлык берётся из словаря той локали,
  в которой идёт рендер

**Interfaces:**
- Consumes: `Dictionary`, `DICTIONARIES` из S1 Task 2.
- Produces: ничего.

- [x] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/i18n/dictionaries.test.ts`:

```ts
import { DICTIONARIES } from "@/i18n/dictionaries";
import { LOCALES } from "@/i18n/config";
import type { PluralForms } from "@/i18n/types";

const HEBREW = /[֐-׿]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/** Brand names and identifiers that stay in Latin script on purpose. */
const ALLOWED_LATIN_ONLY = new Set<string>([
  // заполняется по ходу перевода: ключи, чьё значение — только имя продукта
]);

function values(dict: Record<string, string | PluralForms>): [string, string][] {
  return Object.entries(dict).flatMap(([key, entry]) =>
    typeof entry === "string"
      ? [[key, entry] as [string, string]]
      : Object.values(entry).map((v) => [key, v as string] as [string, string]),
  );
}

describe("dictionaries", () => {
  it("has the same key set in every locale", () => {
    const reference = Object.keys(DICTIONARIES.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort()).toEqual(reference);
    }
  });

  it("translates every Hebrew entry", () => {
    for (const [key, value] of values(DICTIONARIES.he)) {
      if (ALLOWED_LATIN_ONLY.has(key)) continue;
      expect(`${key}: ${value}`).toMatch(HEBREW);
    }
  });

  it("translates every Russian entry", () => {
    for (const [key, value] of values(DICTIONARIES.ru)) {
      if (ALLOWED_LATIN_ONLY.has(key)) continue;
      expect(`${key}: ${value}`).toMatch(CYRILLIC);
    }
  });

  it("keeps every placeholder that the English entry declares", () => {
    for (const locale of LOCALES) {
      for (const [key, enValue] of values(DICTIONARIES.en)) {
        const placeholders = [...enValue.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        if (placeholders.length === 0) continue;
        const translated = values(DICTIONARIES[locale]).filter(([k]) => k === key);
        for (const [, value] of translated) {
          for (const name of placeholders) {
            expect(`${locale}/${key}: ${value}`).toContain(`{${name}}`);
          }
        }
      }
    }
  });

  it("gives Russian plural entries the few and many forms", () => {
    for (const [key, entry] of Object.entries(DICTIONARIES.ru)) {
      if (typeof entry === "string") continue;
      expect(`${key} needs a few form`).toBe(`${key} needs a few form`);
      expect((entry as PluralForms).few).toBeDefined();
      expect((entry as PluralForms).many).toBeDefined();
    }
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- i18n/dictionaries
```
Ожидается: FAIL — значения в `he.ts` и `ru.ts` пока английские.

- [x] **Step 3: Перевести иврит**

Заполнить `frontend/src/i18n/locales/he.ts`. Правила:

- перевод по смыслу, а не подстрочник; ивритский интерфейс короче английского, длинные кнопки резать
- `{count}`, `{name}` и прочие плейсхолдеры сохраняются буква в букву
- бренды и продукты остаются латиницей: `Google`, `Apple`, `iCloud`, `Telegram`
- множественное число: иврит обходится формами `one` и `other`
- ключи, чьё значение целиком английское по замыслу, вносятся в `ALLOWED_LATIN_ONLY` в тесте с комментарием почему

- [x] **Step 4: Перевести русский**

Заполнить `frontend/src/i18n/locales/ru.ts` по тем же правилам, плюс:

- у каждой записи с `{count}` заполнить все четыре формы: `one`, `few`, `many`, `other`
  (`1 запись`, `2 записи`, `5 записей`, `1,5 записи`)

- [x] **Step 5: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- i18n/dictionaries
```
Ожидается: PASS, 5 тестов.

- [x] **Step 6: Проверить руками длину строк**

```bash
npm run dev --workspace=frontend
```

Переключиться на иврит и на русский, пройти все четыре страницы. Искать: обрезанные
кнопки, переносы в две строки там, где было в одну, наезжающие подписи. Слишком
длинные переводы сокращать, а не расширять вёрстку.

- [x] **Step 7: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
npm run build --workspace=frontend
```

- [x] **Step 8: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/i18n/locales frontend/src/__tests__/i18n/dictionaries.test.ts
git commit -m "feat(i18n): translate the UI into Hebrew and Russian"
```

---

## Определение готовности S3

- [x] `npm run test --workspace=frontend` — зелёный, включая 22 новых теста
- [x] Ни одно значение в `he.ts` не осталось английским (кроме внесённых в `ALLOWED_LATIN_ONLY`)
- [x] Ни одно значение в `ru.ts` не осталось английским (те же исключения)
- [x] Все русские записи с `{count}` имеют формы `few` и `many`
- [x] Даты в списке диалогов и размеры вложений меняются при смене языка
- [x] Стартовые подсказки на иврите и русском написаны заново, а не переведены
- [x] Ни одна кнопка не обрезана и не разъехалась на трёх языках
- [x] `/code-review` пройден, находки закрыты, отчёт по осям Standards / Spec

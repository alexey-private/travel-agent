# S2 — RTL-вёрстка

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При `dir="rtl"` интерфейс зеркалится целиком и корректно: отступы, выравнивание, выпадающие меню, боковые панели и направление их выезда.

**Architecture:** Направленные Tailwind-классы (`ml-`, `pr-`, `left-0`, `text-right`) заменяются на логические (`ms-`, `pe-`, `start-0`, `text-end`), которые Tailwind 4 разворачивает в CSS logical properties и которые сами следуют `dir`. Отдельно решается то, что логическими свойствами не покрывается: направление CSS-трансформаций у выезжающих панелей и направление текста в ответе агента.

**Tech Stack:** Tailwind CSS 4, React 19, Jest + Testing Library.

**Spec:** [2026-08-28-i18n-hebrew-design.md](../specs/2026-08-28-i18n-hebrew-design.md) — §4.5.

## Global Constraints

См. [индекс планов](2026-08-28-i18n-hebrew-index.md#global-constraints). Важное именно здесь:

- Меняется **только** вёрстка. Ни одна строка текста, ни одна ветка логики в этой подзадаче не трогается — иначе ревью не сможет отделить регрессию вёрстки от регрессии поведения.
- `dir` берётся с `<html>` (S1 Task 4). Ни один компонент не выставляет `dir` на себе, кроме двух случаев из Task 3 ниже.
- Коммиты — только по явному разрешению пользователя.

---

## Таблица замен

| Направленный класс | Логический | Комментарий |
|---|---|---|
| `ml-N` | `ms-N` | margin-inline-start |
| `mr-N` | `me-N` | margin-inline-end |
| `ml-auto` | `ms-auto` | |
| `mr-auto` | `me-auto` | |
| `pl-N` | `ps-N` | padding-inline-start |
| `pr-N` | `pe-N` | padding-inline-end |
| `left-N` | `start-N` | inset-inline-start |
| `right-N` | `end-N` | inset-inline-end |
| `text-left` | `text-start` | |
| `text-right` | `text-end` | |
| `space-x-N` | `gap-N` | только внутри `flex`/`grid`; `space-x-*` не следует `dir` |
| `rounded-l-*` | `rounded-s-*` | |
| `rounded-r-*` | `rounded-e-*` | |
| `border-l-*` | `border-s-*` | |
| `border-r-*` | `border-e-*` | |

**Не меняются:** `translate-x-*`, `-translate-x-*`, `justify-start/end`, `items-*`,
`inset-y-*`, `left/right` в inline-стилях. Трансформации разбираются отдельно в Task 2.

---

### Task 1: Механическая замена классов

**Files:**
- Modify: `frontend/src/components/chat/MessageBubble.tsx`
- Modify: `frontend/src/components/chat/ChatWindow.tsx`
- Modify: `frontend/src/components/chat/AgentThoughts.tsx`
- Modify: `frontend/src/components/conversations/ConversationList.tsx`
- Modify: `frontend/src/components/memory/MemoryPanel.tsx`
- Modify: `frontend/src/components/shared/AgentSelector.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/settings/page.tsx`
- Modify: `frontend/src/app/calendar/page.tsx`
- Modify: `frontend/src/app/features/page.tsx`

**Interfaces:**
- Consumes: ничего.
- Produces: ничего — только изменённая разметка.

- [ ] **Step 1: Составить полный список вхождений**

```bash
grep -rnE '\b(ml|mr|pl|pr)-(auto|[0-9.]+)|\b(left|right)-(auto|full|[0-9.]+)|\btext-(left|right)\b|\bspace-x-[0-9.]+|\brounded-(l|r)|\bborder-(l|r)-' \
  frontend/src --include='*.tsx'
```

Сохранить вывод — он и есть чек-лист этой задачи. Ожидается порядка 19 вхождений,
сконцентрированных в `MessageBubble.tsx` (~9) и `app/page.tsx` (~2).

- [ ] **Step 2: Заменить по таблице**

Пройти список сверху вниз, применяя таблицу замен. По каждому файлу — отдельный
проход, после каждого файла прогонять `npm run test --workspace=frontend`.

Внимание на два места, где замена **не** механическая:

1. **Выпадающее меню действий в `MessageBubble.tsx`** — `absolute right-0`
   превращается в `absolute end-0`. Проверить, что у родителя стоит `relative`:
   без него `end-0` отсчитывается не от того элемента, и меню при `rtl` уедет
   за край экрана.
2. **`space-x-*`** — заменять на `gap-*` только если у контейнера уже есть
   `flex` или `grid`. Если нет, добавить `flex` в тот же `className`, иначе
   отступы исчезнут.

- [ ] **Step 3: Убедиться, что направленных классов не осталось**

Повторить grep из Step 1. Ожидается: пусто.

- [ ] **Step 4: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
npm run build --workspace=frontend
```

- [ ] **Step 5: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src
git commit -m "refactor(rtl): replace directional Tailwind classes with logical ones"
```

---

### Task 2: Направление выезда боковых панелей

**Files:**
- Modify: `frontend/src/app/page.tsx:115-135` (панель диалогов) и `:150-165` (панель памяти)
- Test: `frontend/src/__tests__/app/slidePanels.test.tsx`

**Interfaces:**
- Consumes: `useLocale` из S1 Task 3.
- Produces: ничего.

**Почему отдельной задачей:** `translate-x-*` логических свойств не имеет.
Панель диалогов на мобильном прячется через `-translate-x-full` (уезжает влево),
панель памяти — через `translate-x-full` (вправо). При `dir="rtl"` каждая должна
уезжать в противоположную сторону, иначе панель «прячется» на видимую часть
экрана и перекрывает чат.

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/__tests__/app/slidePanels.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import Home from "@/app/page";
import { renderWithI18n } from "../helpers/renderWithI18n";

jest.mock("@/lib/api", () => ({
  getOrCreateUserId: () => "session-test",
  __esModule: true,
}));
jest.mock("@/components/chat/ChatWindow", () => ({
  __esModule: true,
  default: () => <div data-testid="chat" />,
}));
jest.mock("@/components/conversations/ConversationList", () => ({
  __esModule: true,
  default: () => <div data-testid="conversations" />,
}));
jest.mock("@/components/memory/MemoryPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="memory" />,
}));

describe("slide-in panels", () => {
  it("hides the conversation panel to the left in a left-to-right layout", async () => {
    renderWithI18n(<Home />, "en");
    const panel = (await screen.findByTestId("conversations")).parentElement!;
    expect(panel.className).toContain("-translate-x-full");
  });

  it("hides the conversation panel to the right in a right-to-left layout", async () => {
    renderWithI18n(<Home />, "he");
    const panel = (await screen.findByTestId("conversations")).parentElement!;
    expect(panel.className).toContain("translate-x-full");
    expect(panel.className).not.toContain("-translate-x-full");
  });

  it("mirrors the memory panel the other way round", async () => {
    renderWithI18n(<Home />, "he");
    const panel = (await screen.findByTestId("memory")).parentElement!.parentElement!;
    expect(panel.className).toContain("-translate-x-full");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- slidePanels
```
Ожидается: FAIL на втором тесте — при `he` класс остаётся `-translate-x-full`.

- [ ] **Step 3: Сделать направление зависимым от `dir`**

В `frontend/src/app/page.tsx` добавить импорт:

```tsx
import { useLocale } from "@/i18n/useT";
```

Внутри компонента:

```tsx
  const { dir } = useLocale();
  const isRtl = dir === "rtl";

  // translate-x has no logical counterpart in Tailwind, so the off-screen
  // direction of each slide-in panel is picked explicitly. Getting this wrong
  // parks a "hidden" panel on top of the chat instead of outside the viewport.
  const sidebarHidden = isRtl ? "translate-x-full" : "-translate-x-full";
  const memoryHidden = isRtl ? "-translate-x-full" : "translate-x-full";
```

Панель диалогов:

```tsx
        <div
          className={`fixed md:static inset-y-0 start-0 z-40 md:z-auto transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : sidebarHidden
          }`}
        >
```

Панель памяти:

```tsx
        <div
          className={`fixed lg:static inset-y-0 end-0 z-40 lg:z-auto transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
            memoryOpen ? "translate-x-0" : memoryHidden
          }`}
        >
```

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- slidePanels
```
Ожидается: PASS, 3 теста.

- [ ] **Step 5: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/app/page.tsx frontend/src/__tests__/app/slidePanels.test.tsx
git commit -m "fix(rtl): mirror slide-in panel direction under rtl"
```

---

### Task 3: Направление текста в сообщениях

**Files:**
- Modify: `frontend/src/components/chat/MessageBubble.tsx`
- Modify: `frontend/src/components/chat/ChatWindow.tsx` (поле ввода)
- Test: `frontend/src/__tests__/components/MessageBubble.test.tsx` (дополнение)

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

**Почему не по языку UI:** агент подстраивается под язык сообщения пользователя
(см. S4), поэтому при русском интерфейсе ответ вполне может прийти на иврите.
Направление конкретного блока должно определяться его содержимым, а не настройкой.
`dir="auto"` — ровно это: браузер смотрит на первый сильный символ.

- [ ] **Step 1: Дописать падающий тест**

Добавить в `frontend/src/__tests__/components/MessageBubble.test.tsx`:

```tsx
  it("lets the browser pick the direction of the message body", () => {
    renderWithI18n(
      <MessageBubble
        role="assistant"
        content="שלום, מצאתי 3 טיסות"
        {...requiredProps}
      />,
    );
    expect(screen.getByText(/שלום/).closest("[dir]")).toHaveAttribute("dir", "auto");
  });

  it("does the same for a user message", () => {
    renderWithI18n(<MessageBubble role="user" content="שלום" {...requiredProps} />);
    expect(screen.getByText("שלום").closest("[dir]")).toHaveAttribute("dir", "auto");
  });
```

`requiredProps` — объект с остальными обязательными пропсами компонента; собрать
его из существующих тестов в этом же файле, чтобы не дублировать их описание.

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run test --workspace=frontend -- MessageBubble
```
Ожидается: FAIL — атрибута `dir` нет.

- [ ] **Step 3: Проставить `dir="auto"`**

В `MessageBubble.tsx` на контейнер, внутри которого рендерится содержимое
сообщения (обёртка вокруг `ReactMarkdown` для ассистента и вокруг текста для
пользователя), добавить `dir="auto"`.

В `ChatWindow.tsx` на `<textarea>` ввода добавить `dir="auto"` — пользователь
может печатать на иврите при английском интерфейсе.

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
npm run test --workspace=frontend -- MessageBubble
```
Ожидается: PASS.

- [ ] **Step 5: Проверить таблицы в ответе агента**

Markdown-таблицы рендерятся внутри блока с `dir="auto"` и наследуют его
направление. Убедиться руками: отправить агенту запрос на иврите, получить ответ
с таблицей, проверить, что порядок колонок читается справа налево и заголовки
совпадают со своими столбцами. Если таблица вылезает за край — обернуть её в
контейнер с `overflow-x-auto` (класс уже направленно-нейтрален).

- [ ] **Step 6: Полная проверка**

```bash
npm run test --workspace=frontend
npx tsc -p frontend/tsconfig.json --noEmit
npm run build --workspace=frontend
```

- [ ] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add frontend/src/components/chat frontend/src/__tests__/components/MessageBubble.test.tsx
git commit -m "feat(rtl): render message bodies and the composer with dir=auto"
```

---

### Task 4: Визуальная проверка четырёх страниц

**Files:** нет изменений кода — задача проверочная.

- [ ] **Step 1: Поднять приложение**

```bash
docker compose up -d
npm run dev:backend-lg &
npm run dev:frontend
```

- [ ] **Step 2: Пройти чек-лист на иврите**

Переключить язык на `עברית` и проверить каждый пункт:

- [ ] `/` — шапка: иконки, селектор агента и переключатель языков зеркалятся, ничего не наезжает
- [ ] `/` — панель диалогов на узком экране выезжает справа и полностью прячется
- [ ] `/` — панель памяти на узком экране выезжает слева и полностью прячется
- [ ] `/` — сообщение пользователя прижато к правому краю, ответ агента к левому (или наоборот, но последовательно)
- [ ] `/` — выпадающее меню действий у сообщения не уезжает за край экрана
- [ ] `/` — блок «размышлений» агента: отступы списка справа
- [ ] `/settings` — все секции, подписи полей и кнопки зеркалированы
- [ ] `/calendar` — список событий и задач, отступы, ссылка на настройки
- [ ] `/features` — весь текст и списки
- [ ] Переключение обратно на `EN` возвращает исходную раскладку без перезагрузки

- [ ] **Step 3: Проверить, что горизонтальной прокрутки нет**

На каждой странице в консоли браузера:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```
Ожидается `true` на всех четырёх страницах в обоих направлениях.

- [ ] **Step 4: Зафиксировать найденное**

Каждое расхождение из чек-листа чинится в том файле, где оно возникло, отдельным
коммитом с префиксом `fix(rtl):`.

---

## Определение готовности S2

- [ ] `grep` из Task 1 Step 1 не находит направленных классов
- [ ] `npm run test --workspace=frontend` — зелёный, включая 5 новых тестов
- [ ] `npm run build --workspace=frontend` — проходит
- [ ] Чек-лист Task 4 пройден целиком на всех четырёх страницах
- [ ] Горизонтальной прокрутки нет ни на одной странице ни в одном направлении
- [ ] `/code-review` пройден, находки закрыты, отчёт по осям Standards / Spec

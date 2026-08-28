# S4 — Язык агента

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Агент отвечает на языке пользователя, follow-up подсказки и извлечение памяти работают на том же языке, распознавание речи получает подсказку языка, а ошибки, которые фронт показывает мимо LLM, приходят с машинным кодом.

**Architecture:** Язык доезжает из `POST /api/chat` через `AgentState` в builder системного промпта. В промпт добавляется общий блок `## Language` — рядом с существующим `TELEGRAM_FORMATTING`. Строки ошибок инструментов остаются английскими: они контракт с LLM, а пользователь их на английском не увидит, потому что промпт обязывает агента пересказывать содержимое tool-результатов.

**Tech Stack:** LangGraph, `@langchain/anthropic`, Fastify, Jest.

**Spec:** [2026-08-28-i18n-hebrew-design.md](../specs/2026-08-28-i18n-hebrew-design.md) — §5.1–5.5.

## Global Constraints

См. [индекс планов](2026-08-28-i18n-hebrew-index.md#global-constraints). Важное именно здесь:

- Строки ошибок в `src/tools/**` **не переводятся**. Существующие ~50 ассертов на английские тексты ошибок остаются как есть.
- Ключи пользовательской памяти остаются английскими (`home_city`, `diet`) — по ним идёт дедупликация. Локализуются только значения.
- Новый параметр `language` добавляется **последним** в существующие сигнатуры, со значением по умолчанию `DEFAULT_LOCALE` — так ни один существующий вызов не ломается.
- Коммиты — только по явному разрешению пользователя.

**Отклонения от плана, принятые при реализации:**

- **Блок `## Language` переписан после живой проверки.** Формулировка из плана
  («by default … reply in THAT language instead») не работала: агент с настройкой
  `he` отвечал на иврите и на английский вопрос. Приоритет инвертирован явно, с
  примером, и добавлено «do this silently» — иначе агент проговаривал выбранный
  язык первой строкой ответа.
- **Добавлен `src/i18n/detectReplyLocale.ts`.** Пункт готовности «follow-up
  подсказки — на языке ответа» иначе не выполняется: `getSuggestions` получал
  язык настройки, и под английским ответом появлялись ивритские подсказки.
- **`FIRST_PERSON_RE` без `אוהב` и `מעדיף`.** В иврите настоящее время первого и
  третьего лица совпадает («אני אוהב» / «הוא אוהב»), поэтому голые глаголы дают
  ложные срабатывания на фразах не о пользователе. `אני` и `שלי` этот случай уже
  покрывают.
- **Тесты сервисов написаны в стиле своих файлов** — через общий `mockInvoke`, а
  не `jest.spyOn((service as any).model, …)`, как в плане: файлы уже мокают
  модель на уровне модуля.
- **Ключи `errors.*` заведены только под коды, достижимые из UI** — остальные коды
  никуда не показываются, и заводить под них переводы на три языка означало бы
  держать мёртвые записи в словарях. Неизвестный код откатывается на общий ключ
  вызывающего, так что пробел в словаре не выносит сырой ключ на экран.
- **Поиск ключа по коду вынесен в `frontend/src/lib/errorCode.ts`** и подключён ко
  всем местам `api.ts` / `settingsApi.ts`, показывающим ошибку пользователю, — а не
  только к двум, где раньше протекал английский. Так §5.5 выполняется по букве:
  «фронт переводит по `code`, с fallback».
- **Имена ключей — camelCase, а не код дословно.** `add-ui-string` в SKILL.md
  требует `<namespace>.<camelCase>`; snake_case кода конвертируется в месте
  поиска, а не заводится в словаре как есть.
- **Английские значения `errors.*` написаны как текст для человека**, а не
  скопированы из поля `error` (`"text is required"`): поле `error` осталось
  прежним для логов и существующих потребителей, а словарная запись — это то,
  что читает пользователь.

---

### Task 1: Блок Language в системных промптах

**Files:**
- Modify: `backend-langgraph/src/agent/prompts.ts`
- Test: `backend-langgraph/tests/unit/agent/prompts.test.ts`

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE`, `LANGUAGE_NAMES` из S0 Task 1.
- Produces:
  ```ts
  export function buildTravelAgentSystemPrompt(
    memories: UserMemory[], userId?: string, taskListName?: string,
    ragContext?: string | null, platform?: 'web' | 'telegram', language?: Locale,
  ): string;
  export function buildShoppingAgentSystemPrompt(
    memories: UserMemory[], userId?: string, taskListName?: string,
    ragContext?: string | null, platform?: 'web' | 'telegram', language?: Locale,
  ): string;
  ```

- [x] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/unit/agent/prompts.test.ts`:

```ts
import { buildTravelAgentSystemPrompt, buildShoppingAgentSystemPrompt } from '@/agent/prompts';

const builders = [
  ['travel', buildTravelAgentSystemPrompt],
  ['shopping', buildShoppingAgentSystemPrompt],
] as const;

describe.each(builders)('%s system prompt — language block', (_name, build) => {
  it('names Hebrew when the user speaks Hebrew', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toContain('## Language');
    expect(prompt).toContain('Hebrew');
  });

  it('names Russian when the user speaks Russian', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'ru');
    expect(prompt).toContain('Russian');
    expect(prompt).not.toContain('The user\'s language is Hebrew');
  });

  it('defaults to English when no language is given', () => {
    const prompt = build([], 'u1');
    expect(prompt).toContain('## Language');
    expect(prompt).toContain('English');
  });

  it('tells the agent to follow the language of the latest message', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toMatch(/reply in THAT language/i);
  });

  it('tells the agent to translate tool output instead of surfacing it raw', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toMatch(/never surface raw English tool output/i);
  });

  it('tells the agent to leave identifiers alone', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toMatch(/airport\/IATA codes/i);
  });

  it('keeps the Telegram formatting block working alongside the language block', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'telegram', 'he');
    expect(prompt).toContain('## Language');
    expect(prompt).toContain('Telegram');
    expect(prompt).toContain('NEVER use pipe tables');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/agent/prompts.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — блока `## Language` в промпте нет.

- [x] **Step 3: Добавить блок в prompts.ts**

Добавить импорт в начало `backend-langgraph/src/agent/prompts.ts`:

```ts
import { Locale, DEFAULT_LOCALE, LANGUAGE_NAMES } from '../i18n/locale';
```

Добавить константу рядом с `TELEGRAM_FORMATTING`:

```ts
function languageSection(language: Locale): string {
  const name = LANGUAGE_NAMES[language];
  return `
## Language — ALWAYS apply
The user's interface language is ${name}, but the language of their LATEST message overrides it.
- Work out which language the latest user message is written in. Do this silently: never announce
  the language you picked, and never open a response by naming it.
- If it is not ${name} — for example the message is in English while the setting says ${name} —
  reply in THAT language, and ignore the setting for this turn.
- If the latest message is in ${name}, or its language is unclear, write your ENTIRE response in ${name}.
- Tool results come back in English, including error messages. Translate their content into the
  response language — never surface raw English tool output or tool error text to the user.
- Keep unchanged: airport/IATA codes, airline and hotel names, product model names, currency codes, URLs.
- Hebrew: numbers, dates, prices and Latin identifiers stay as-is — they render correctly inside
  right-to-left text. Do not reverse them and do not transliterate them.
`.trim();
}
```

В обеих функциях-билдерах добавить параметр и вставить секцию **перед**
`## Response Formatting`:

```ts
export function buildTravelAgentSystemPrompt(
  memories: UserMemory[],
  userId?: string,
  taskListName = 'Travel Plans',
  ragContext?: string | null,
  platform?: 'web' | 'telegram',
  language: Locale = DEFAULT_LOCALE,
): string {
```

и в шаблоне строки, непосредственно над строкой `## Response Formatting — ALWAYS apply`:

```
${languageSection(language)}

## Response Formatting — ALWAYS apply
```

То же самое в `buildShoppingAgentSystemPrompt`.

- [x] **Step 4: Убедиться, что тест проходит**

```bash
npx jest tests/unit/agent/prompts.test.ts --rootDir backend-langgraph
```
Ожидается: PASS, 14 тестов (7 × 2 билдера).

- [x] **Step 5: Проверить, что снапшот-тест reasonNode не сломался**

```bash
npx jest tests/unit/graph/reasonNode.test.ts --rootDir backend-langgraph
```
Если тест сверяет промпт целиком — обновить ожидание, добавив новый блок. Если
проверяет вхождения подстрок — должен остаться зелёным без правок.

- [x] **Step 6: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/agent/prompts.ts backend-langgraph/tests/unit/agent/prompts.test.ts
git commit -m "feat(i18n): add a language section to both agent system prompts"
```

---

### Task 2: Проброс языка через граф

**Files:**
- Modify: `backend-langgraph/src/graph/state.ts`
- Modify: `backend-langgraph/src/graph/travelGraph.ts:47-50`
- Modify: `backend-langgraph/src/graph/shoppingGraph.ts` (аналогичный вызов `buildAgentGraph`)
- Modify: `backend-langgraph/src/routes/chat.ts`
- Test: `backend-langgraph/tests/unit/graph/languageState.test.ts`

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE`, `isLocale` (S0 Task 1); билдеры промптов (Task 1); `UserPreferences.language` (S0 Task 2).
- Produces: `AgentStateType.language: Locale`; `ChatBody.language?: Locale`.

**Приоритет источников:** `body.language` → `prefs.language` → `DEFAULT_LOCALE`.
Тело запроса главнее, потому что пользователь мог переключить язык в этой же
вкладке секунду назад, а запись в БД идёт асинхронно. Если `body.language`
отличается от сохранённого — значение дописывается в БД, не блокируя стрим.

- [x] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/unit/graph/languageState.test.ts`:

```ts
import { AgentState } from '@/graph/state';
import { buildTravelAgentSystemPrompt } from '@/agent/prompts';
import type { AgentStateType } from '@/graph/state';

describe('AgentState.language', () => {
  it('is part of the state annotation', () => {
    expect(Object.keys(AgentState.spec)).toContain('language');
  });

  it('reaches the prompt builder', () => {
    const state = {
      memories: [],
      userId: 'u1',
      taskListName: 'Travel Plans',
      ragContext: null,
      platform: 'web' as const,
      language: 'he' as const,
    } as unknown as AgentStateType;

    const prompt = buildTravelAgentSystemPrompt(
      state.memories ?? [],
      state.userId,
      state.taskListName,
      state.ragContext,
      state.platform,
      state.language,
    );
    expect(prompt).toContain('Hebrew');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/graph/languageState.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — в `AgentState.spec` нет ключа `language`.

- [x] **Step 3: Добавить поле в состояние**

В `backend-langgraph/src/graph/state.ts` добавить импорт и аннотацию:

```ts
import { Locale, DEFAULT_LOCALE } from '../i18n/locale';
```

```ts
  /** User's language — controls the response language in the system prompt. */
  language: Annotation<Locale>({
    default: () => DEFAULT_LOCALE,
    reducer: (_, next) => next,
  }),
```

- [x] **Step 4: Пробросить в билдеры промптов**

В `backend-langgraph/src/graph/travelGraph.ts`:

```ts
  return buildAgentGraph(
    tools,
    (state: AgentStateType) =>
      buildTravelAgentSystemPrompt(
        state.memories ?? [],
        state.userId,
        state.taskListName,
        state.ragContext,
        state.platform,
        state.language,
      ),
  );
```

Идентичная правка в `backend-langgraph/src/graph/shoppingGraph.ts` с
`buildShoppingAgentSystemPrompt`.

- [x] **Step 5: Принять язык в chat-роуте**

В `backend-langgraph/src/routes/chat.ts`:

Импорт:
```ts
import { Locale, DEFAULT_LOCALE, isLocale } from '../i18n/locale';
```

Тип тела:
```ts
interface ChatBody {
  userId: string;
  message: string;
  conversationId?: string;
  agentType?: 'travel' | 'shopping';
  platform?: 'web' | 'telegram';
  language?: Locale;
  attachments?: Attachment[];
}
```

Деструктуризация — добавить `language: bodyLanguage`:
```ts
      const { userId, message, conversationId: existingConvId, agentType = 'travel',
              platform, language: bodyLanguage, attachments } = request.body;
```

После загрузки `userPrefs` (сразу за `Promise.all`) определить язык:
```ts
      // The body wins over the stored value: the user may have switched language
      // in this very tab a moment ago, and that write to the database is async.
      const language: Locale = isLocale(bodyLanguage)
        ? bodyLanguage
        : (userPrefs.language ?? DEFAULT_LOCALE);

      if (isLocale(bodyLanguage) && bodyLanguage !== userPrefs.language) {
        void prefRepo.save(userId, { language: bodyLanguage }).catch((err) => {
          request.log.warn({ requestId: request.id, err }, 'failed to persist language');
        });
      }
```

Передать в граф — добавить `language` в объект начального состояния:
```ts
        for await (const event of graph.streamEvents(
          { messages: initialMessages, userId, conversationId, agentType, platform,
            memories, taskListName, ragContext, language },
          { version: 'v2', signal: ac.signal },
        )) {
```

- [x] **Step 6: Убедиться, что тест проходит**

```bash
npx jest tests/unit/graph/languageState.test.ts --rootDir backend-langgraph
```
Ожидается: PASS, 2 теста.

- [x] **Step 7: Отправить язык с фронта**

В `frontend/src/hooks/useStreamChat.ts` добавить `language` в тело POST-запроса
к `/api/chat`, взяв его из `useLocale()`.

- [x] **Step 8: Полная проверка**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
npm run test --workspace=frontend
```

- [x] **Step 9: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/graph backend-langgraph/src/routes/chat.ts \
        backend-langgraph/tests/unit/graph/languageState.test.ts \
        frontend/src/hooks/useStreamChat.ts
git commit -m "feat(i18n): thread the user language from the chat request into the graph"
```

---

### Task 3: Follow-up подсказки на языке пользователя

**Files:**
- Modify: `backend-langgraph/src/services/SuggestionService.ts`
- Modify: `backend-langgraph/src/routes/chat.ts` (вызов `getSuggestions`)
- Test: `backend-langgraph/tests/unit/services/SuggestionService.test.ts` (дополнение)

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE`, `LANGUAGE_NAMES` (S0 Task 1).
- Produces:
  ```ts
  getSuggestions(userMessage: string, assistantReply: string,
                 agentType?: 'travel' | 'shopping', language?: Locale): Promise<string[]>;
  ```

- [x] **Step 1: Дописать падающий тест**

Добавить в `backend-langgraph/tests/unit/services/SuggestionService.test.ts`:

```ts
  it('asks the model for Hebrew follow-ups', async () => {
    const service = new SuggestionService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = jest.spyOn((service as any).model, 'invoke')
      .mockResolvedValue({ content: '["א","ב","ג"]' });

    await service.getSuggestions('שלום', 'מצאתי 3 טיסות', 'travel', 'he');

    const prompt = invoke.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('Hebrew');
  });

  it('defaults to English follow-ups', async () => {
    const service = new SuggestionService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = jest.spyOn((service as any).model, 'invoke')
      .mockResolvedValue({ content: '["a","b","c"]' });

    await service.getSuggestions('hi', 'found 3 flights', 'travel');

    const prompt = invoke.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('English');
  });
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/services/SuggestionService.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — в промпте нет упоминания языка.

- [x] **Step 3: Добавить язык в промпт сервиса**

В `backend-langgraph/src/services/SuggestionService.ts` добавить импорт и параметр:

```ts
import { Locale, DEFAULT_LOCALE, LANGUAGE_NAMES } from '../i18n/locale';
```

```ts
  async getSuggestions(
    userMessage: string,
    assistantReply: string,
    agentType: 'travel' | 'shopping' = 'travel',
    language: Locale = DEFAULT_LOCALE,
  ): Promise<string[]> {
```

В теле промпта заменить блок правил:

```ts
Rules:
- Output ONLY a valid JSON array of 3 strings
- Write every question in ${LANGUAGE_NAMES[language]}
- Each question must be short (under 10 words)
- Write questions from the user's perspective (use "my", "I", "me" — not "your" or "you")
- No explanation, no markdown, no extra text
```

- [x] **Step 4: Передать язык из chat-роута**

```ts
        // Suggestions sit directly under the reply, so they follow the reply's own
        // language: the prompt lets the agent answer in the language of the user's
        // latest message, which is not always the language in the settings.
        const replyLanguage = detectReplyLocale(assistantText, language);
        const suggestions = await suggestionService.getSuggestions(message, assistantText, agentType, replyLanguage);
```

`detectReplyLocale` живёт в
[src/i18n/detectReplyLocale.ts](../../../backend-langgraph/src/i18n/detectReplyLocale.ts)
и определяет язык по письменности: три поддерживаемых языка используют три разных
алфавита, поэтому этого достаточно. Латиница считается последней и проигрывает
ничьи — в ивритском и русском ответах регулярно встречаются IATA-коды, названия
авиакомпаний и URL, обратного не бывает. Тесты:
`tests/unit/i18n/detectReplyLocale.test.ts`.

- [x] **Step 5: Убедиться, что тесты проходят**

```bash
npx jest tests/unit/services/SuggestionService.test.ts --rootDir backend-langgraph
```
Ожидается: PASS.

- [x] **Step 6: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/services/SuggestionService.ts \
        backend-langgraph/src/routes/chat.ts \
        backend-langgraph/tests/unit/services/SuggestionService.test.ts
git commit -m "feat(i18n): generate follow-up suggestions in the user's language"
```

---

### Task 4: Извлечение памяти на языке пользователя

**Files:**
- Modify: `backend-langgraph/src/services/MemoryService.ts:8-43`
- Modify: `backend-langgraph/src/routes/chat.ts` (вызов `extractAndSaveMemories`)
- Test: `backend-langgraph/tests/unit/services/MemoryService.test.ts` (дополнение)

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE`, `LANGUAGE_NAMES` (S0 Task 1).
- Produces:
  ```ts
  extractAndSaveMemories(internalUserId: string, message: string,
                         agentType?: 'travel' | 'shopping', language?: Locale): Promise<void>;
  ```

**Две отдельные проблемы:**

1. Промпт извлечения английский, поэтому модель записывает значения по-английски
   даже когда пользователь писал на иврите. Ключи должны остаться английскими —
   по ним идёт дедупликация; локализуются только значения.
2. `FIRST_PERSON_RE` — дешёвый гейт, отсекающий сообщения без личных фактов до
   вызова LLM. Он знает английский и русский, но не иврит, поэтому у
   ивритоязычного пользователя память не наполняется вовсе.

- [x] **Step 1: Дописать падающий тест**

Добавить в `backend-langgraph/tests/unit/services/MemoryService.test.ts`:

```ts
  it('recognises a first-person statement in Hebrew', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FIRST_PERSON_RE } = require('@/services/MemoryService');
    expect(FIRST_PERSON_RE.test('אני גר בתל אביב ואני צמחוני')).toBe(true);
    expect(FIRST_PERSON_RE.test('שלי הטיסה מחר')).toBe(true);
    expect(FIRST_PERSON_RE.test('מה מזג האוויר ברומא')).toBe(false);
  });

  it('asks the model to write memory values in the user language', async () => {
    const service = new MemoryService(poolMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = jest.spyOn((service as any).model, 'invoke').mockResolvedValue({ content: '{}' });

    await service.extractAndSaveMemories(
      'internal-uuid',
      'אני גר בתל אביב ואני צמחוני, אוהב לטוס עם אל על',
      'travel',
      'he',
    );

    const system = invoke.mock.calls[0][0][0].content as string;
    expect(system).toContain('Hebrew');
    expect(system).toMatch(/keys .*English/i);
  });
```

Для первого теста нужно экспортировать `FIRST_PERSON_RE` из модуля.

- [x] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/services/MemoryService.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — `FIRST_PERSON_RE` не экспортирован и не знает иврита.

- [x] **Step 3: Расширить гейт на иврит**

В `backend-langgraph/src/services/MemoryService.ts` заменить константу:

```ts
// English patterns use \b (works fine — they're ASCII); Russian and Hebrew patterns skip \b
// since JS's default \b is ASCII-\w-based and never matches at a non-Latin word boundary.
// Hebrew has no capital letters and no articles, so the pronouns and possessive prefixes
// below are the whole signal: אני (I), שלי (my/mine), לי (to me), אנחנו (we), קוראים לי (my name is).
export const FIRST_PERSON_RE =
  /\b(i |i'm |i've |i am |my |i like |i prefer |i have |i own |i use )|(меня зовут|я живу|я люблю|я предпочитаю|мне нравится|у меня есть|мой |моя |моё |зовут меня)|(אני |שלי|יש לי|קוראים לי|אנחנו |אוהב |מעדיף )/i;
```

- [x] **Step 4: Добавить язык в промпты извлечения**

Превратить обе константы в функции, принимающие язык:

```ts
import { Locale, DEFAULT_LOCALE, LANGUAGE_NAMES } from '../i18n/locale';

function languageRule(language: Locale): string {
  return `- The user writes in ${LANGUAGE_NAMES[language]}. Write memory VALUES in ${LANGUAGE_NAMES[language]},
  but keep the JSON keys in English exactly as shown in the example — keys are machine identifiers
  used for deduplication and must never be translated.`;
}

function travelExtractPrompt(language: Locale): string {
  return `${TRAVEL_EXTRACT_PROMPT_BODY}
${languageRule(language)}`;
}

function shoppingExtractPrompt(language: Locale): string {
  return `${SHOPPING_EXTRACT_PROMPT_BODY}
${languageRule(language)}`;
}
```

где `TRAVEL_EXTRACT_PROMPT_BODY` и `SHOPPING_EXTRACT_PROMPT_BODY` — существующие
константы, переименованные без изменения содержимого.

Добавить параметр в метод:

```ts
  async extractAndSaveMemories(
    internalUserId: string,
    message: string,
    agentType: 'travel' | 'shopping' = 'travel',
    language: Locale = DEFAULT_LOCALE,
  ): Promise<void> {
```

и использовать соответствующую функцию вместо константы при сборке `SystemMessage`.

- [x] **Step 5: Передать язык из chat-роута**

```ts
        memoryService.extractAndSaveMemories(internalUserId, message, agentType, language),
```

- [x] **Step 6: Убедиться, что тесты проходят**

```bash
npx jest tests/unit/services/MemoryService.test.ts --rootDir backend-langgraph
```
Ожидается: PASS.

- [x] **Step 7: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/services/MemoryService.ts \
        backend-langgraph/src/routes/chat.ts \
        backend-langgraph/tests/unit/services/MemoryService.test.ts
git commit -m "feat(i18n): extract memories in the user language and recognise Hebrew first-person speech"
```

---

### Task 5: Подсказка языка для Whisper

**Files:**
- Modify: `backend-langgraph/src/routes/transcribe.ts`
- Modify: `frontend/src/hooks/useVoiceRecording.ts` (передача языка)
- Test: `backend-langgraph/tests/unit/routes/transcribe.test.ts`

**Interfaces:**
- Consumes: `isLocale` (S0 Task 1).
- Produces: `POST /api/transcribe` принимает необязательное поле `language`.

**Зачем:** без подсказки Whisper определяет язык сам и на коротких ивритских
репликах регулярно ошибается — отдаёт транслитерацию латиницей или соседний
язык. Подсказка стоит одну строку.

- [x] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/unit/routes/transcribe.test.ts`:

```ts
import Fastify, { FastifyInstance } from 'fastify';
import { transcribeRoutes } from '@/routes/transcribe';

jest.mock('@/config/env', () => ({ env: { OPENAI_API_KEY: 'test-key' } }));

describe('POST /api/transcribe — language hint', () => {
  let app: FastifyInstance;
  let capturedForm: FormData;

  beforeEach(async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedForm = init.body as FormData;
      return Promise.resolve({ ok: true, json: async () => ({ text: 'שלום' }) });
    }) as unknown as typeof fetch;

    app = Fastify();
    await app.register(transcribeRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('forwards a supported language to Whisper', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm', language: 'he' },
    });
    expect(res.statusCode).toBe(200);
    expect(capturedForm.get('language')).toBe('he');
  });

  it('omits the hint when no language is given', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
    });
    expect(capturedForm.get('language')).toBeNull();
  });

  it('omits the hint when the language is not supported', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm', language: 'de' },
    });
    expect(capturedForm.get('language')).toBeNull();
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/routes/transcribe.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — поле `language` в форму не попадает.

- [x] **Step 3: Добавить подсказку**

В `backend-langgraph/src/routes/transcribe.ts`:

```ts
import { isLocale } from '../i18n/locale';

interface TranscribeBody {
  audio: string;
  mimeType: string;
  language?: string;
}
```

```ts
    const { audio, mimeType, language } = req.body ?? {};
```

после `form.append('model', 'whisper-1');`:

```ts
    // Whisper auto-detects, but short Hebrew clips are routinely mis-detected and
    // come back transliterated into Latin script. An explicit hint costs nothing.
    if (isLocale(language)) form.append('language', language);
```

- [x] **Step 4: Передать язык с фронта**

В `frontend/src/hooks/useVoiceRecording.ts` добавить `language` в тело запроса
к `/api/transcribe`, взяв из `useLocale()`.

- [x] **Step 5: Убедиться, что тест проходит**

```bash
npx jest tests/unit/routes/transcribe.test.ts --rootDir backend-langgraph
```
Ожидается: PASS, 3 теста.

- [x] **Step 6: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/routes/transcribe.ts \
        backend-langgraph/tests/unit/routes/transcribe.test.ts \
        frontend/src/hooks/useVoiceRecording.ts
git commit -m "feat(i18n): pass a language hint to Whisper"
```

---

### Task 6: Коды HTTP-ошибок

**Files:**
- Modify: `backend-langgraph/src/routes/chat.ts`, `export.ts`, `settings.ts`, `transcribe.ts`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/settingsApi.ts`
- Modify: `frontend/src/i18n/locales/{en,he,ru}.ts` (ключи `errors.*`)
- Test: `backend-langgraph/tests/unit/routes/errorCodes.test.ts`

**Interfaces:**
- Consumes: словари из S1.
- Produces: у каждого ответа с ошибкой появляется поле `code: string` рядом с существующим `error: string`.

**Зачем отдельно от промпта:** ошибки инструментов пользователь видит через
агента, и тот их переводит. Но ошибки самих HTTP-роутов (`400 userId required`,
`503 Google Drive is not configured`) фронт показывает напрямую, минуя LLM —
их перевести некому.

**Обратная совместимость:** поле `error` остаётся на месте с прежним английским
текстом. Существующие тесты и потребители не ломаются, а фронт использует `code`
как ключ перевода и падает обратно на `error`, если ключа нет.

- [x] **Step 1: Написать падающий тест**

Создать `backend-langgraph/tests/unit/routes/errorCodes.test.ts`:

```ts
import Fastify, { FastifyInstance } from 'fastify';
import { exportRoutes } from '@/routes/export';

describe('error responses carry a machine-readable code', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(exportRoutes, {});
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a code alongside the English message for a missing body field', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/export/pdf', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'text is required', code: 'text_required' });
  });

  it('returns a code when Drive is not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf-to-drive',
      payload: { text: 'hello', userId: 'u1' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('drive_not_configured');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

```bash
npx jest tests/unit/routes/errorCodes.test.ts --rootDir backend-langgraph
```
Ожидается: FAIL — в ответе нет поля `code`.

- [x] **Step 3: Добавить коды в роуты**

Пройти по всем `reply.status(...).send({ error: ... })` и `reply.code(...).send({ error: ... })`
в четырёх файлах, добавив `code`. Соответствие «текст → код»:

| Текст ошибки | `code` |
|---|---|
| `userId and message (or attachment) are required` | `chat_input_required` |
| `Request timed out` | `chat_timeout` |
| `text is required` | `text_required` |
| `userId is required` | `user_id_required` |
| `userId required` | `user_id_required` |
| `Google Drive is not configured on this server.` | `drive_not_configured` |
| `calendarProvider must be "google" or "apple"` | `invalid_calendar_provider` |
| `language must be one of "en", "he", "ru"` | `invalid_language` |
| `audio (base64) and mimeType are required` | `transcribe_input_required` |
| `OPENAI_API_KEY is not configured on the server` | `transcribe_not_configured` |
| `Whisper API error: <status>` | `transcribe_upstream_error` |
| `appleId and appPassword required` | `apple_credentials_required` |
| `Invalid Apple ID or app-specific password. …` | `apple_invalid_credentials` |
| `Apple iCloud not connected` | `apple_not_connected` |
| CalDAV-исключение, текст из `(err as Error).message` | `apple_request_failed` |
| `url required` | `url_required` |
| текст из `result.error` при загрузке в Drive | `drive_upload_failed` |

Найти все места:

```bash
grep -rn "send({ error" backend-langgraph/src/routes
```

Каждое должно получить `code` из таблицы. Если встретится текст, которого в
таблице нет, — добавить строку в таблицу и завести ключ по тому же принципу
(snake_case, по смыслу, без упоминания HTTP-статуса).

- [x] **Step 4: Добавить ключи в словари**

В `frontend/src/i18n/locales/en.ts` (и, соответственно, `he.ts`, `ru.ts`) завести
ключ на каждый код, который **может дойти до экрана**. Имя ключа — по правилу
`add-ui-string` из SKILL.md: `<namespace>.<camelCase>`, то есть
`errors.driveNotConfigured`, а не `errors.drive_not_configured`; snake_case кода
переводится в имя ключа на месте поиска.

Значения пишутся как текст для человека, а не копируются из поля `error`
(`"text is required"` — это прозаическая строка для логов). Поле `error` остаётся
прежним ради обратной совместимости.

Коды, до экрана не доходящие, ключей не получают: `apple_not_connected` и
`apple_request_failed` приходят только из `/auth/apple/reminder-lists`, где фронт
глотает ошибку и возвращает `[]`; `invalid_language` и `invalid_calendar_provider`
недостижимы, пока значения приходят из собственных `select` фронта.

- [x] **Step 5: Переводить по коду на фронте**

Поиск ключа по коду вынесен в
[frontend/src/lib/errorCode.ts](../../../frontend/src/lib/errorCode.ts):

```ts
export function errorKeyFor(code: string | undefined, fallback: TKey): TKey {
  if (!code) return fallback;
  const camel = code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const key = `errors.${camel}`;
  return key in en ? (key as TKey) : fallback;
}
```

Ключ, которого нет в словаре, откатывается на общий ключ вызывающего, а не
показывается пользователю сырым, — поэтому заводить запись под каждый код не
требуется. `errorKeyOf(response, fallback)` — та же функция поверх тела ответа.

Через него проходят все места `api.ts` и `settingsApi.ts`, которые показывают
ошибку пользователю. Один общий помощник означает, что роут, начавший отдавать
более точный код, подхватывается без правки места вызова.

- [x] **Step 6: Убедиться, что тест проходит**

```bash
npx jest tests/unit/routes/errorCodes.test.ts --rootDir backend-langgraph
```
Ожидается: PASS, 2 теста.

- [x] **Step 7: Полная проверка**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
npm run test --workspace=frontend
```

- [x] **Step 8: Commit** *(выполнять только с разрешения пользователя)*

```bash
git add backend-langgraph/src/routes frontend/src/lib frontend/src/i18n \
        backend-langgraph/tests/unit/routes/errorCodes.test.ts
git commit -m "feat(i18n): give HTTP error responses machine-readable codes"
```

---

### Task 7: Проверка на живом агенте

**Files:** нет изменений кода — задача проверочная.

- [x] **Step 1: Поднять окружение**

```bash
docker compose up -d
npm run dev:backend-lg &
npm run dev:frontend
```

- [x] **Step 2: Пройти сценарии**

- [x] Иврит в настройках, вопрос на иврите → ответ целиком на иврите, заголовки и таблицы тоже
- [x] Иврит в настройках, вопрос на английском → ответ на английском (правило «следуй за сообщением»)
- [x] Русский в настройках, вопрос на русском → ответ на русском
- [x] Ответ содержит поиск рейсов → IATA-коды и названия авиакомпаний остались латиницей
- [x] Ошибка инструмента (отключить Google в `/settings`, попросить добавить событие в календарь) → пользователь видит объяснение на своём языке, а не английский текст ошибки
- [x] Follow-up подсказки под ответом — на языке ответа
- [x] Голосовой ввод на иврите → распознан ивритом, не транслитерацией
- [x] Сказать «אני גר בתל אביב ואני צמחוני» → в панели памяти появилась запись с английским ключом и ивритским значением

- [x] **Step 3: Обновить AGENTS.md**

Отметить, что `language` прокидывается через `AgentState` и влияет на промпты,
подсказки, память и распознавание речи.

---

## Определение готовности S4

- [x] `npx tsc -p backend-langgraph/tsconfig.json --noEmit` — чисто
- [x] `npm run test:all --workspace=backend-langgraph` — зелёный, включая ~25 новых тестов
- [x] Ни один существующий тест на английские строки ошибок инструментов не изменён
- [x] Все сценарии Task 7 пройдены
- [x] `/code-review` пройден, находки закрыты, отчёт по осям Standards / Spec

import { HumanMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createModel, type Provider } from '../llm/createModel';
import { createModelPair } from '../llm/modelPair';
import { withProviderFallback } from '../llm/providerFallback';
import { Locale, DEFAULT_LOCALE, LANGUAGE_NAMES } from '@travel-agent/i18n';

export class SuggestionService {
  private readonly modelFor: (provider: Provider) => BaseChatModel;

  constructor() {
    this.modelFor = createModelPair(provider => createModel('fast', { maxTokens: 150 }, provider));
  }

  async getSuggestions(
    userMessage: string,
    assistantReply: string,
    agentType: 'travel' | 'shopping' = 'travel',
    language: Locale = DEFAULT_LOCALE,
  ): Promise<string[]> {
    if (!assistantReply.trim()) return [];

    const persona = agentType === 'shopping' ? 'shopping assistant' : 'travel assistant';

    const messages = [
      new HumanMessage(
        `You are a ${persona}. Given the Q&A below, output exactly 3 short follow-up questions the user might ask next.

Rules:
- Output ONLY a valid JSON array of 3 strings
- Write every question in ${LANGUAGE_NAMES[language]}
- Each question must be short (under 10 words)
- Write questions from the user's perspective (use "my", "I", "me" — not "your" or "you")
- No explanation, no markdown, no extra text

User question: ${userMessage}
Assistant answer (summary): ${assistantReply.slice(0, 800)}

Output (JSON array only):`,
      ),
    ];

    try {
      // No abort signal and no partial-output veto: this is a single short
      // completion, not a stream, and nothing of it has reached the user when it
      // fails. The outer catch below stays exactly as it was — if both providers
      // are down the caller still gets no suggestions, just no longer silently.
      const response = await withProviderFallback(
        provider => this.modelFor(provider).invoke(messages),
        { context: 'suggestions' },
      );

      const raw = typeof response.content === 'string' ? response.content : '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed: unknown = JSON.parse(match[0]);
      return Array.isArray(parsed) ? (parsed as string[]).slice(0, 3) : [];
    } catch {
      return [];
    }
  }
}

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { env } from '../config/env';

/**
 * Generates contextual follow-up question suggestions after an agent response.
 * Uses the fast Haiku/GPT-4o-mini model for low-latency single-turn completion.
 */
export class SuggestionService {
  async getSuggestions(
    userMessage: string,
    assistantReply: string,
    agentType: 'travel' | 'shopping' = 'travel',
  ): Promise<string[]> {
    if (!assistantReply.trim()) return [];

    const persona = agentType === 'shopping' ? 'shopping assistant' : 'travel assistant';

    try {
      let model;
      if (env.LLM_PROVIDER === 'openai') {
        model = new ChatOpenAI({ model: 'gpt-4o-mini', apiKey: env.OPENAI_API_KEY, maxTokens: 150 });
      } else {
        model = new ChatAnthropic({ model: 'claude-haiku-4-5-20251001', apiKey: env.ANTHROPIC_API_KEY, maxTokens: 150 });
      }

      const response = await model.invoke([
        new HumanMessage(
          `You are a ${persona}. Given the Q&A below, output exactly 3 short follow-up questions the user might ask next.

Rules:
- Output ONLY a valid JSON array of 3 strings
- Each question must be short (under 10 words)
- Write questions from the user's perspective (use "my", "I", "me" — not "your" or "you")
- No explanation, no markdown, no extra text

User question: ${userMessage}
Assistant answer (summary): ${assistantReply.slice(0, 800)}

Output (JSON array only):`,
        ),
      ]);

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

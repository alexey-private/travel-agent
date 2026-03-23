import { LLMClient } from '../llm/LLMClient';

/**
 * Generates contextual follow-up question suggestions after an agent response.
 */
export class SuggestionService {
  constructor(private llmClient: LLMClient) {}

  async getSuggestions(userMessage: string, assistantReply: string): Promise<string[]> {
    if (!assistantReply.trim()) return [];
    try {
      const raw = await this.llmClient.complete({
        messages: [
          {
            role: 'user',
            content: `You are a travel assistant. Given the Q&A below, output exactly 3 short follow-up questions the user might ask next.

Rules:
- Output ONLY a valid JSON array of 3 strings
- Each question must be short (under 10 words)
- Write questions from the user's perspective (use "my", "I", "me" — not "your" or "you")
- No explanation, no markdown, no extra text

User question: ${userMessage}
Assistant answer (summary): ${assistantReply.slice(0, 800)}

Output (JSON array only):`,
          },
        ],
        maxTokens: 150,
      });
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed: unknown = JSON.parse(match[0]);
      return Array.isArray(parsed) ? (parsed as string[]).slice(0, 3) : [];
    } catch {
      return [];
    }
  }
}

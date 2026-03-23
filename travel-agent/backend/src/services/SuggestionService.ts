import Anthropic from '@anthropic-ai/sdk';

/**
 * Generates contextual follow-up question suggestions after an agent response.
 */
export class SuggestionService {
  constructor(private anthropic: Anthropic) {}

  async getSuggestions(userMessage: string, assistantReply: string): Promise<string[]> {
    if (!assistantReply.trim()) return [];
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: `You are a travel assistant. Given the Q&A below, output exactly 3 short follow-up questions the user might ask next.

Rules:
- Output ONLY a valid JSON array of 3 strings
- Each question must be short (under 10 words)
- No explanation, no markdown, no extra text

User question: ${userMessage}
Assistant answer (summary): ${assistantReply.slice(0, 800)}

Output (JSON array only):`,
          },
        ],
      });
      const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed: unknown = JSON.parse(match[0]);
      return Array.isArray(parsed) ? (parsed as string[]).slice(0, 3) : [];
    } catch {
      return [];
    }
  }
}

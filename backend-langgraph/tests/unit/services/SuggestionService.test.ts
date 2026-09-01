import { SuggestionService } from '@/services/SuggestionService';
import { __resetFallbackStateForTests } from '@/llm/providerFallback';
import { env } from '@/config/env';
import { ChatOpenAI } from '@langchain/openai';

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    PORT: 3000,
    NODE_ENV: 'test',
    FAST_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

const mockInvoke = jest.fn();
// The standby gets a spy of its own, so a test can prove *which* provider
// answered rather than merely that something did.
const mockOpenAIInvoke = jest.fn();
jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: mockOpenAIInvoke })),
}));

const MockChatOpenAI = ChatOpenAI as unknown as jest.Mock;

describe('SuggestionService', () => {
  let service: SuggestionService;

  beforeEach(() => {
    __resetFallbackStateForTests();
    mockInvoke.mockReset();
    // Unavailable unless a test says otherwise: a test that reaches the standby
    // without meaning to then reads as "both providers down" — the documented
    // degraded path — rather than as an undefined response.
    mockOpenAIInvoke.mockReset().mockRejectedValue(new Error('standby not configured'));
    MockChatOpenAI.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    service = new SuggestionService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getSuggestions', () => {
    it('returns 3 follow-up questions from valid JSON response', async () => {
      mockInvoke.mockResolvedValue({
        content: '["What is the visa cost?", "How long is the flight?", "Do I need vaccinations?"]',
      });

      const result = await service.getSuggestions(
        'How do I travel to Japan?',
        'You need a visa and the flight takes 14 hours.',
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('What is the visa cost?');
    });

    it('returns empty array when assistantReply is empty', async () => {
      const result = await service.getSuggestions('Hello?', '');

      expect(result).toEqual([]);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('returns empty array when assistantReply is whitespace only', async () => {
      const result = await service.getSuggestions('Hello?', '   ');

      expect(result).toEqual([]);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('extracts JSON array embedded in prose', async () => {
      mockInvoke.mockResolvedValue({
        content: 'Here are suggestions: ["Best hotels?", "Cheapest flights?", "Visa types?"] Hope this helps.',
      });

      const result = await service.getSuggestions('Tell me about Paris', 'Paris is great for tourism.');

      expect(result).toHaveLength(3);
      expect(result[1]).toBe('Cheapest flights?');
    });

    it('returns at most 3 suggestions even if model returns more', async () => {
      mockInvoke.mockResolvedValue({
        content: '["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"]',
      });

      const result = await service.getSuggestions('Multi question', 'Long answer here.');

      expect(result).toHaveLength(3);
    });

    it('returns empty array when model response is not valid JSON', async () => {
      mockInvoke.mockResolvedValue({ content: 'No suggestions available.' });

      const result = await service.getSuggestions('Question', 'Answer');

      expect(result).toEqual([]);
    });

    it('returns empty array when model invoke throws and there is no standby', async () => {
      // Deployments with no OPENAI_API_KEY have no standby at all, and this is
      // the case that keeps proving what it always proved: one provider, one
      // failure, no suggestions. Without removing the key the fallback would
      // answer here, and the test would quietly become a second copy of
      // 'still degrades to no suggestions when both providers fail'.
      jest.replaceProperty(env as { OPENAI_API_KEY?: string }, 'OPENAI_API_KEY', '');
      mockInvoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.getSuggestions('Question', 'Answer');

      expect(result).toEqual([]);
      expect(mockOpenAIInvoke).not.toHaveBeenCalled();
    });

    it('uses shopping persona when agentType is shopping', async () => {
      mockInvoke.mockResolvedValue({ content: '["Q1?", "Q2?", "Q3?"]' });

      await service.getSuggestions('Find laptops', 'Here are the top laptops.', 'shopping');

      const promptContent = mockInvoke.mock.calls[0][0][0].content as string;
      expect(promptContent).toContain('shopping assistant');
    });

    it('uses travel persona by default', async () => {
      mockInvoke.mockResolvedValue({ content: '["Q1?", "Q2?", "Q3?"]' });

      await service.getSuggestions('Find flights', 'Here are flights.');

      const promptContent = mockInvoke.mock.calls[0][0][0].content as string;
      expect(promptContent).toContain('travel assistant');
    });

    it('returns empty array when model returns a non-array JSON value', async () => {
      // The regex looks for [...] so use a response that has no square brackets at all
      mockInvoke.mockResolvedValue({ content: '"just a plain string"' });

      const result = await service.getSuggestions('Question', 'Answer');

      expect(result).toEqual([]);
    });

    it('asks the model for Hebrew follow-ups', async () => {
      mockInvoke.mockResolvedValue({ content: '["א","ב","ג"]' });

      await service.getSuggestions('שלום', 'מצאתי 3 טיסות', 'travel', 'he');

      const promptContent = mockInvoke.mock.calls[0][0][0].content as string;
      expect(promptContent).toContain('Hebrew');
    });

    it('defaults to English follow-ups', async () => {
      mockInvoke.mockResolvedValue({ content: '["a","b","c"]' });

      await service.getSuggestions('hi', 'found 3 flights', 'travel');

      const promptContent = mockInvoke.mock.calls[0][0][0].content as string;
      expect(promptContent).toContain('English');
    });
  });

  /**
   * Suggestions already swallowed every error into `return []`, so during the
   * 2026-08-31 outage they were down and silent. The fallback has to be visible
   * from the outside — which provider answered, and a loud line when neither did.
   */
  describe('provider fallback', () => {
    it('answers from the standby provider when the primary one fails', async () => {
      mockInvoke.mockRejectedValue(new Error('credit balance is too low'));
      mockOpenAIInvoke.mockResolvedValue({ content: '["From OpenAI?", "Q2?", "Q3?"]' });

      const result = await service.getSuggestions('Question', 'Answer');

      expect(result).toEqual(['From OpenAI?', 'Q2?', 'Q3?']);
      expect(mockOpenAIInvoke).toHaveBeenCalledTimes(1);
    });

    it('hands the standby the same prompt the primary was given', async () => {
      mockInvoke.mockRejectedValue(new Error('overloaded'));
      mockOpenAIInvoke.mockResolvedValue({ content: '["a","b","c"]' });

      await service.getSuggestions('Find flights', 'Here are flights.', 'shopping', 'he');

      const primaryPrompt = mockInvoke.mock.calls[0][0][0].content as string;
      const standbyPrompt = mockOpenAIInvoke.mock.calls[0][0][0].content as string;
      expect(standbyPrompt).toBe(primaryPrompt);
      expect(standbyPrompt).toContain('shopping assistant');
      expect(standbyPrompt).toContain('Hebrew');
    });

    it('never constructs the standby while the primary is answering', async () => {
      mockInvoke.mockResolvedValue({ content: '["Q1?", "Q2?", "Q3?"]' });

      await service.getSuggestions('Question', 'Answer');
      await service.getSuggestions('Another', 'Answer');

      expect(MockChatOpenAI).not.toHaveBeenCalled();
    });

    it('constructs the standby once and reuses it across further failures', async () => {
      mockInvoke.mockRejectedValue(new Error('down'));
      mockOpenAIInvoke.mockResolvedValue({ content: '["a","b","c"]' });

      await service.getSuggestions('Q1', 'A1');
      await service.getSuggestions('Q2', 'A2');

      expect(MockChatOpenAI).toHaveBeenCalledTimes(1);
      expect(mockOpenAIInvoke).toHaveBeenCalledTimes(2);
    });

    it('still degrades to no suggestions when both providers fail', async () => {
      mockInvoke.mockRejectedValue(new Error('anthropic down'));
      mockOpenAIInvoke.mockRejectedValue(new Error('openai down too'));

      const result = await service.getSuggestions('Question', 'Answer');

      // Today's behaviour exactly — but no longer silent.
      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

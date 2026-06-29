import { SuggestionService } from '@/services/SuggestionService';

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
jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));

describe('SuggestionService', () => {
  let service: SuggestionService;

  beforeEach(() => {
    mockInvoke.mockReset();
    service = new SuggestionService();
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

    it('returns empty array when model invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.getSuggestions('Question', 'Answer');

      expect(result).toEqual([]);
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
  });
});

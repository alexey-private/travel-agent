import { Pool } from 'pg';
import { MemoryService, FIRST_PERSON_RE } from '@/services/MemoryService';
import { MemoryRepository } from '@/repositories/MemoryRepository';
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
  },
}));

jest.mock('@/repositories/MemoryRepository');

// Mock the LangChain model at the module level.
// MemoryService instantiates ChatAnthropic/ChatOpenAI inline, so we mock invoke() on the prototype.
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

const MockMemoryRepository = MemoryRepository as jest.MockedClass<typeof MemoryRepository>;
const MockChatOpenAI = ChatOpenAI as unknown as jest.Mock;

describe('MemoryService', () => {
  let service: MemoryService;
  let mockRepo: jest.Mocked<MemoryRepository>;

  beforeEach(() => {
    MockMemoryRepository.mockClear();
    __resetFallbackStateForTests();
    mockInvoke.mockReset();
    // Unavailable unless a test says otherwise: a test that reaches the standby
    // without meaning to then reads as "both providers down" — the documented
    // degraded path — rather than as an undefined response.
    mockOpenAIInvoke.mockReset().mockRejectedValue(new Error('standby not configured'));
    MockChatOpenAI.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    service = new MemoryService(null as unknown as Pool);
    mockRepo = MockMemoryRepository.mock.instances[0] as jest.Mocked<MemoryRepository>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getMemories', () => {
    it('delegates to MemoryRepository.getMemories', async () => {
      const memories = [{ key: 'home_city', value: 'San Francisco' }];
      mockRepo.getMemories.mockResolvedValue(memories);

      const result = await service.getMemories('user-1');

      expect(mockRepo.getMemories).toHaveBeenCalledWith('user-1', 'travel');
      expect(result).toEqual(memories);
    });
  });

  describe('deleteMemory', () => {
    it('delegates to MemoryRepository.deleteMemory', async () => {
      mockRepo.deleteMemory.mockResolvedValue(undefined);

      await service.deleteMemory('user-1', 'home_city');

      expect(mockRepo.deleteMemory).toHaveBeenCalledWith('user-1', 'home_city', 'travel');
    });
  });

  describe('extractAndSaveMemories', () => {
    it('calls the LLM, parses the JSON response, and upserts each key-value pair', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({
        content: '{"home_city": "San Francisco", "diet": "vegetarian", "budget": "mid-range"}',
      });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I live in San Francisco and I am vegetarian.');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsertMemory).toHaveBeenCalledTimes(3);
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'home_city', 'San Francisco', 'travel');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'diet', 'vegetarian', 'travel');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'budget', 'mid-range', 'travel');
    });

    it('extracts from a Russian first-person message on the very first turn', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({
        content: '{"name": "Алексей", "home_city": "Ashkelon"}',
      });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories(
        'user-1',
        'привет, меня зовут Алексей. Я живу в Ашкелон, Израиль. чем можешь помочь?',
      );

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'name', 'Алексей', 'travel');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'home_city', 'Ashkelon', 'travel');
    });

    it('passes existing memories to the LLM as context', async () => {
      mockRepo.getMemories.mockResolvedValue([
        { key: 'home_city', value: 'Ashkelon' },
        { key: 'name', value: 'Alexey' },
      ]);
      mockInvoke.mockResolvedValue({ content: '{"airline": "EL AL"}' });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I usually fly EL AL.');

      const callArg = mockInvoke.mock.calls[0][0];
      // callArg[0] is SystemMessage (prompt), callArg[1] is HumanMessage (memories + user message)
      const msgContent = callArg[1].content as string;
      expect(msgContent).toContain('home_city: Ashkelon');
      expect(msgContent).toContain('name: Alexey');
    });

    it('handles JSON embedded in surrounding prose', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({
        content: 'Here are the extracted preferences: {"airline": "United"} Hope this helps.',
      });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I always fly United Airlines.');

      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'airline', 'United', 'travel');
    });

    it('skips saving when the LLM returns an empty object', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({ content: '{}' });

      await service.extractAndSaveMemories('user-1', 'Just book something nice.');

      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not call the LLM when the user message is empty', async () => {
      await service.extractAndSaveMemories('user-1', '   ');

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not throw when the LLM returns unparseable text', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({ content: 'No preferences found.' });

      await expect(
        service.extractAndSaveMemories('user-1', 'Hello, how are you?'),
      ).resolves.toBeUndefined();

      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not throw when the LLM call rejects and there is no standby', async () => {
      // Deployments with no OPENAI_API_KEY have no standby at all, and this is
      // the case that keeps proving what it always proved: one provider, one
      // failure, extraction skipped. Without removing the key the fallback would
      // answer here, and the test would quietly become a second copy of
      // 'still skips extraction quietly when both providers fail'.
      jest.replaceProperty(env as { OPENAI_API_KEY?: string }, 'OPENAI_API_KEY', '');
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockRejectedValue(new Error('API error'));

      await expect(
        service.extractAndSaveMemories('user-1', 'Book a flight.'),
      ).resolves.toBeUndefined();

      expect(mockOpenAIInvoke).not.toHaveBeenCalled();
    });

    it('uses the shopping prompt when agentType is shopping', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({ content: '{"preferred_brands": "Nike"}' });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I love Nike shoes.', 'shopping');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const msgContent = mockInvoke.mock.calls[0][0][0].content as string;
      expect(msgContent).toContain('shopping preferences');
    });

    it('asks the model to write memory values in the user language', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockResolvedValue({ content: '{}' });

      await service.extractAndSaveMemories(
        'user-1',
        'אני גר בתל אביב ואני צמחוני, אוהב לטוס עם אל על',
        'travel',
        'he',
      );

      const system = mockInvoke.mock.calls[0][0][0].content as string;
      expect(system).toContain('Hebrew');
      expect(system).toMatch(/keys .*English/i);
    });
  });

  /**
   * Extraction already swallowed every error into a console.warn, so during the
   * 2026-08-31 outage it was down and all but silent. The fallback has to be
   * visible from the outside — which provider answered, and a loud line when
   * neither did.
   */
  describe('provider fallback', () => {
    beforeEach(() => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockRepo.upsertMemory.mockResolvedValue(undefined);
    });

    it('answers from the standby provider when the primary one fails', async () => {
      mockInvoke.mockRejectedValue(new Error('credit balance is too low'));
      mockOpenAIInvoke.mockResolvedValue({ content: '{"home_city": "Paris"}' });

      await service.extractAndSaveMemories('user-1', 'I live in Paris.');

      expect(mockOpenAIInvoke).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'home_city', 'Paris', 'travel');
    });

    it('hands the standby the same messages the primary was given', async () => {
      mockInvoke.mockRejectedValue(new Error('overloaded'));
      mockOpenAIInvoke.mockResolvedValue({ content: '{}' });

      await service.extractAndSaveMemories('user-1', 'I love Nike shoes.', 'shopping', 'he');

      const [primaryMessages] = mockInvoke.mock.calls[0];
      const [standbyMessages] = mockOpenAIInvoke.mock.calls[0];
      // Identity: the same array object, not a second one built for the retry.
      expect(standbyMessages).toBe(primaryMessages);
      expect(standbyMessages[0].content as string).toContain('shopping preferences');
      expect(standbyMessages[0].content as string).toContain('Hebrew');
    });

    it('never constructs the standby while the primary is answering', async () => {
      mockInvoke.mockResolvedValue({ content: '{}' });

      await service.extractAndSaveMemories('user-1', 'I live in Paris.');
      await service.extractAndSaveMemories('user-1', 'I prefer aisle seats.');

      expect(MockChatOpenAI).not.toHaveBeenCalled();
    });

    it('constructs the standby once and reuses it across further failures', async () => {
      mockInvoke.mockRejectedValue(new Error('down'));
      mockOpenAIInvoke.mockResolvedValue({ content: '{}' });

      await service.extractAndSaveMemories('user-1', 'I live in Paris.');
      await service.extractAndSaveMemories('user-1', 'I prefer aisle seats.');

      expect(MockChatOpenAI).toHaveBeenCalledTimes(1);
      expect(mockOpenAIInvoke).toHaveBeenCalledTimes(2);
    });

    it('still skips extraction quietly when both providers fail', async () => {
      mockInvoke.mockRejectedValue(new Error('anthropic down'));
      mockOpenAIInvoke.mockRejectedValue(new Error('openai down too'));

      await expect(
        service.extractAndSaveMemories('user-1', 'I live in Paris.'),
      ).resolves.toBeUndefined();

      // Today's behaviour exactly — but no longer silent.
      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  /**
   * The gate runs before the LLM is ever called, so a language it cannot read is
   * a language whose users never get any memory at all.
   */
  describe('FIRST_PERSON_RE', () => {
    it('recognises a first-person statement in Hebrew', () => {
      expect(FIRST_PERSON_RE.test('אני גר בתל אביב ואני צמחוני')).toBe(true);
      expect(FIRST_PERSON_RE.test('הטיסה שלי מחר')).toBe(true);
      expect(FIRST_PERSON_RE.test('מה מזג האוויר ברומא')).toBe(false);
    });

    it('still recognises English and Russian', () => {
      expect(FIRST_PERSON_RE.test('I live in Tel Aviv')).toBe(true);
      expect(FIRST_PERSON_RE.test('я живу в Тель-Авиве')).toBe(true);
      expect(FIRST_PERSON_RE.test('what is the weather in Rome')).toBe(false);
    });
  });
});

import { Pool } from 'pg';
import { MemoryService } from '@/services/MemoryService';
import { MemoryRepository } from '@/repositories/MemoryRepository';

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
jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));

const MockMemoryRepository = MemoryRepository as jest.MockedClass<typeof MemoryRepository>;

describe('MemoryService', () => {
  let service: MemoryService;
  let mockRepo: jest.Mocked<MemoryRepository>;

  beforeEach(() => {
    MockMemoryRepository.mockClear();
    mockInvoke.mockReset();

    service = new MemoryService(null as unknown as Pool);
    mockRepo = MockMemoryRepository.mock.instances[0] as jest.Mocked<MemoryRepository>;
  });

  describe('getMemories', () => {
    it('delegates to MemoryRepository.getMemories', async () => {
      const memories = [{ key: 'home_city', value: 'San Francisco' }];
      mockRepo.getMemories.mockResolvedValue(memories);

      const result = await service.getMemories('user-1');

      expect(mockRepo.getMemories).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(memories);
    });
  });

  describe('deleteMemory', () => {
    it('delegates to MemoryRepository.deleteMemory', async () => {
      mockRepo.deleteMemory.mockResolvedValue(undefined);

      await service.deleteMemory('user-1', 'home_city');

      expect(mockRepo.deleteMemory).toHaveBeenCalledWith('user-1', 'home_city');
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
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'home_city', 'San Francisco');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'diet', 'vegetarian');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'budget', 'mid-range');
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
      // The HumanMessage content should include existing memories
      const msgContent = callArg[0].content as string;
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

      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'airline', 'United');
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

    it('does not throw when the LLM call rejects', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockInvoke.mockRejectedValue(new Error('API error'));

      await expect(
        service.extractAndSaveMemories('user-1', 'Book a flight.'),
      ).resolves.toBeUndefined();
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
  });
});

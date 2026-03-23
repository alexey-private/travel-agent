import { Pool } from 'pg';
import { MemoryService } from '@/services/MemoryService';
import { MemoryRepository } from '@/repositories/MemoryRepository';
import { LLMClient } from '@/llm/LLMClient';

jest.mock('@/repositories/MemoryRepository');

const MockMemoryRepository = MemoryRepository as jest.MockedClass<typeof MemoryRepository>;

describe('MemoryService', () => {
  let service: MemoryService;
  let mockRepo: jest.Mocked<MemoryRepository>;
  let mockComplete: jest.Mock;

  beforeEach(() => {
    MockMemoryRepository.mockClear();

    mockComplete = jest.fn();
    const mockLLMClient = { complete: mockComplete, stream: jest.fn() } as unknown as LLMClient;

    service = new MemoryService(null as unknown as Pool, mockLLMClient);
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
      mockComplete.mockResolvedValue(
        '{"home_city": "San Francisco", "diet": "vegetarian", "budget": "mid-range"}',
      );
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I live in San Francisco and I am vegetarian.');

      expect(mockComplete).toHaveBeenCalledTimes(1);
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
      mockComplete.mockResolvedValue('{"airline": "EL AL"}');
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I usually fly EL AL.');

      const callArg = mockComplete.mock.calls[0][0];
      const userContent = callArg.messages[0].content as string;
      expect(userContent).toContain('home_city: Ashkelon');
      expect(userContent).toContain('name: Alexey');
    });

    it('handles JSON embedded in surrounding prose', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockComplete.mockResolvedValue(
        'Here are the extracted preferences: {"airline": "United"} Hope this helps.',
      );
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I always fly United Airlines.');

      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'airline', 'United');
    });

    it('skips saving when the LLM returns an empty object', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockComplete.mockResolvedValue('{}');

      await service.extractAndSaveMemories('user-1', 'Just book something nice.');

      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not call the LLM when the user message is empty', async () => {
      await service.extractAndSaveMemories('user-1', '   ');

      expect(mockComplete).not.toHaveBeenCalled();
      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not throw when the LLM returns unparseable text', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockComplete.mockResolvedValue('No preferences found.');

      await expect(
        service.extractAndSaveMemories('user-1', 'Hello, how are you?'),
      ).resolves.toBeUndefined();

      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not throw when the LLM call rejects', async () => {
      mockRepo.getMemories.mockResolvedValue([]);
      mockComplete.mockRejectedValue(new Error('API error'));

      await expect(
        service.extractAndSaveMemories('user-1', 'Book a flight.'),
      ).resolves.toBeUndefined();
    });
  });
});

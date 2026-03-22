import Anthropic from '@anthropic-ai/sdk';
import { MemoryService } from '@/services/MemoryService';
import { MemoryRepository } from '@/repositories/MemoryRepository';

jest.mock('@/repositories/MemoryRepository');

const MockMemoryRepository = MemoryRepository as jest.MockedClass<typeof MemoryRepository>;

describe('MemoryService', () => {
  let service: MemoryService;
  let mockRepo: jest.Mocked<MemoryRepository>;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    MockMemoryRepository.mockClear();

    mockCreate = jest.fn();
    const mockAnthropic = { messages: { create: mockCreate } } as unknown as Anthropic;

    service = new MemoryService({} as any, mockAnthropic);
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
    it('calls Claude, parses the JSON response, and upserts each key-value pair', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '{"home_city": "San Francisco", "diet": "vegetarian", "budget": "mid-range"}',
          },
        ],
      });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'User: I live in San Francisco and I am vegetarian.');

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsertMemory).toHaveBeenCalledTimes(3);
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'home_city', 'San Francisco');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'diet', 'vegetarian');
      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'budget', 'mid-range');
    });

    it('handles JSON embedded in surrounding prose', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Here are the extracted preferences: {"airline": "United"} Hope this helps.',
          },
        ],
      });
      mockRepo.upsertMemory.mockResolvedValue(undefined);

      await service.extractAndSaveMemories('user-1', 'I always fly United Airlines.');

      expect(mockRepo.upsertMemory).toHaveBeenCalledWith('user-1', 'airline', 'United');
    });

    it('skips saving when Claude returns an empty object', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      });

      await service.extractAndSaveMemories('user-1', 'Just book something nice.');

      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not call Claude when the conversation text is empty', async () => {
      await service.extractAndSaveMemories('user-1', '   ');

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not throw when Claude returns unparseable text', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'No preferences found.' }],
      });

      // Should complete without throwing
      await expect(
        service.extractAndSaveMemories('user-1', 'Hello, how are you?'),
      ).resolves.toBeUndefined();

      expect(mockRepo.upsertMemory).not.toHaveBeenCalled();
    });

    it('does not throw when the Anthropic call rejects', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      await expect(
        service.extractAndSaveMemories('user-1', 'Book a flight.'),
      ).resolves.toBeUndefined();
    });
  });
});

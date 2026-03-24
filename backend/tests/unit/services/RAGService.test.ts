import { Pool } from 'pg';
import { RAGService } from '@/services/RAGService';
import { KnowledgeRepository } from '@/repositories/KnowledgeRepository';
import { EmbeddingService } from '@/services/EmbeddingService';
import { LLMClient } from '@/llm/LLMClient';

jest.mock('@/repositories/KnowledgeRepository');

const MockKnowledgeRepository = KnowledgeRepository as jest.MockedClass<typeof KnowledgeRepository>;

describe('RAGService', () => {
  let service: RAGService;
  let mockRepo: jest.Mocked<KnowledgeRepository>;
  let mockEmbed: jest.Mock;
  let mockComplete: jest.Mock;

  beforeEach(() => {
    MockKnowledgeRepository.mockClear();

    mockComplete = jest.fn();
    const mockLLMClient = { complete: mockComplete, stream: jest.fn() } as unknown as LLMClient;

    mockEmbed = jest.fn().mockResolvedValue(Array(1536).fill(0.1));
    const mockEmbeddingService = { embed: mockEmbed } as unknown as EmbeddingService;

    service = new RAGService(null as unknown as Pool, mockLLMClient, mockEmbeddingService);
    mockRepo = MockKnowledgeRepository.mock.instances[0] as jest.Mocked<KnowledgeRepository>;
  });

  describe('shouldQueryKnowledgeBase', () => {
    it('returns true when the model responds with "yes"', async () => {
      mockComplete.mockResolvedValue('yes');

      const result = await service.shouldQueryKnowledgeBase('Do I need a visa for Japan?');

      expect(result).toBe(true);
    });

    it('returns true when the model responds with "yes" followed by more text', async () => {
      mockComplete.mockResolvedValue('Yes, this needs a knowledge base lookup.');

      const result = await service.shouldQueryKnowledgeBase('What vaccines do I need for Thailand?');

      expect(result).toBe(true);
    });

    it('returns false when the model responds with "no"', async () => {
      mockComplete.mockResolvedValue('no');

      const result = await service.shouldQueryKnowledgeBase('What time is it?');

      expect(result).toBe(false);
    });

    it('defaults to true when the LLM call throws', async () => {
      mockComplete.mockRejectedValue(new Error('API unavailable'));

      const result = await service.shouldQueryKnowledgeBase('Any query');

      expect(result).toBe(true);
    });
  });

  describe('retrieve', () => {
    it('embeds the query and returns similar chunks from the repository', async () => {
      const chunks = [
        { topic: 'Tokyo visa', content: 'No visa needed for 90 days.', similarity: 0.95 },
        { topic: 'Tokyo hotels', content: 'Shinjuku is a great area.', similarity: 0.87 },
      ];
      mockRepo.findSimilar.mockResolvedValue(chunks);

      const result = await service.retrieve('Tokyo travel', 2);

      expect(mockEmbed).toHaveBeenCalledWith('Tokyo travel');
      expect(mockRepo.findSimilar).toHaveBeenCalledWith(expect.any(Array), 2);
      expect(result).toEqual(chunks);
    });

    it('uses topK=3 by default', async () => {
      mockRepo.findSimilar.mockResolvedValue([]);

      await service.retrieve('Tokyo');

      expect(mockRepo.findSimilar).toHaveBeenCalledWith(expect.any(Array), 3);
    });
  });

  describe('ingestDocument', () => {
    it('embeds the content and inserts it into the repository', async () => {
      mockRepo.insert.mockResolvedValue(undefined);

      await service.ingestDocument('Tokyo visa', 'No visa needed for 90 days.', { source: 'gov' });

      expect(mockEmbed).toHaveBeenCalledWith('No visa needed for 90 days.');
      expect(mockRepo.insert).toHaveBeenCalledWith(
        'Tokyo visa',
        'No visa needed for 90 days.',
        expect.any(Array),
        { source: 'gov' },
      );
    });
  });

  describe('buildRagContext', () => {
    it('returns formatted context string when RAG is needed and chunks are found', async () => {
      mockComplete.mockResolvedValue('yes');
      mockRepo.findSimilar.mockResolvedValue([
        { topic: 'Tokyo visa', content: 'Visa-free for 90 days.', similarity: 0.9 },
        { topic: 'Tokyo health', content: 'No vaccinations required.', similarity: 0.8 },
      ]);

      const context = await service.buildRagContext('Do I need a visa for Japan?');

      expect(context).toContain('[Tokyo visa]');
      expect(context).toContain('Visa-free for 90 days.');
      expect(context).toContain('[Tokyo health]');
    });

    it('returns null when RAG is not needed', async () => {
      mockComplete.mockResolvedValue('no');

      const context = await service.buildRagContext('What time is it?');

      expect(context).toBeNull();
      expect(mockRepo.findSimilar).not.toHaveBeenCalled();
    });

    it('returns null when no chunks are found', async () => {
      mockComplete.mockResolvedValue('yes');
      mockRepo.findSimilar.mockResolvedValue([]);

      const context = await service.buildRagContext('Obscure travel question');

      expect(context).toBeNull();
    });
  });
});

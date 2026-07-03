import { Pool } from 'pg';
import { RAGService } from '@/services/RAGService';
import { KnowledgeRepository } from '@/repositories/KnowledgeRepository';
import { EmbeddingService } from '@/services/EmbeddingService';

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

jest.mock('@/repositories/KnowledgeRepository');

const MockKnowledgeRepository = KnowledgeRepository as jest.MockedClass<typeof KnowledgeRepository>;

describe('RAGService', () => {
  let service: RAGService;
  let mockRepo: jest.Mocked<KnowledgeRepository>;
  let mockEmbed: jest.Mock;

  beforeEach(() => {
    MockKnowledgeRepository.mockClear();

    mockEmbed = jest.fn().mockResolvedValue(Array(512).fill(0.1));
    const mockEmbeddingService = { embed: mockEmbed } as unknown as EmbeddingService;

    service = new RAGService(null as unknown as Pool, mockEmbeddingService);
    mockRepo = MockKnowledgeRepository.mock.instances[0] as jest.Mocked<KnowledgeRepository>;
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
      expect(mockRepo.findSimilar).toHaveBeenCalledWith(expect.any(Array), 2, undefined);
      expect(result).toEqual(chunks);
    });

    it('uses topK=3 by default', async () => {
      mockRepo.findSimilar.mockResolvedValue([]);

      await service.retrieve('Tokyo');

      expect(mockRepo.findSimilar).toHaveBeenCalledWith(expect.any(Array), 3, undefined);
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
    it('returns formatted context when chunks meet similarity threshold', async () => {
      mockRepo.findSimilar.mockResolvedValue([
        { topic: 'Tokyo visa', content: 'Visa-free for 90 days.', similarity: 0.90 },
        { topic: 'Tokyo health', content: 'No vaccinations required.', similarity: 0.80 },
      ]);

      const context = await service.buildRagContext('Do I need a visa for Japan?');

      expect(context).toContain('[Tokyo visa]');
      expect(context).toContain('Visa-free for 90 days.');
      expect(context).toContain('[Tokyo health]');
    });

    it('returns null when all chunks are below the similarity threshold', async () => {
      mockRepo.findSimilar.mockResolvedValue([
        { topic: 'Unrelated topic', content: 'Some content.', similarity: 0.30 },
        { topic: 'Another topic', content: 'More content.', similarity: 0.40 },
      ]);

      const context = await service.buildRagContext('What time is it?');

      expect(context).toBeNull();
    });

    it('returns null when no chunks are found', async () => {
      mockRepo.findSimilar.mockResolvedValue([]);

      const context = await service.buildRagContext('Obscure travel question');

      expect(context).toBeNull();
    });

    it('excludes chunks below threshold when some pass and some do not', async () => {
      mockRepo.findSimilar.mockResolvedValue([
        { topic: 'Tokyo visa', content: 'Visa-free for 90 days.', similarity: 0.85 },
        { topic: 'Low relevance', content: 'Barely related.', similarity: 0.50 },
      ]);

      const context = await service.buildRagContext('Japan visa requirements');

      expect(context).toContain('[Tokyo visa]');
      expect(context).not.toContain('[Low relevance]');
    });

    it('returns cached result on repeated calls without hitting the repository again', async () => {
      mockRepo.findSimilar.mockResolvedValue([
        { topic: 'Tokyo visa', content: 'Visa-free for 90 days.', similarity: 0.90 },
      ]);

      await service.buildRagContext('Japan visa?');
      await service.buildRagContext('Japan visa?');

      expect(mockRepo.findSimilar).toHaveBeenCalledTimes(1);
    });
  });
});

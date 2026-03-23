import { UserService } from '@/services/UserService';
import { UserRepository } from '@/repositories/UserRepository';

jest.mock('@/repositories/UserRepository');

const MockUserRepository = UserRepository as jest.MockedClass<typeof UserRepository>;

describe('UserService', () => {
  let service: UserService;
  let mockRepo: jest.Mocked<UserRepository>;

  beforeEach(() => {
    MockUserRepository.mockClear();
    service = new UserService({} as any);
    mockRepo = MockUserRepository.mock.instances[0] as jest.Mocked<UserRepository>;
  });

  describe('findOrCreateUser', () => {
    it('delegates to UserRepository.findOrCreateUser and returns the user id', async () => {
      mockRepo.findOrCreateUser.mockResolvedValue('uuid-123');

      const result = await service.findOrCreateUser('session-abc');

      expect(mockRepo.findOrCreateUser).toHaveBeenCalledWith('session-abc');
      expect(result).toBe('uuid-123');
    });
  });

  describe('verifyOwnership', () => {
    it('returns true when the conversation belongs to the user', async () => {
      mockRepo.verifyOwnership.mockResolvedValue(true);

      const result = await service.verifyOwnership('user-1', 'conv-1');

      expect(mockRepo.verifyOwnership).toHaveBeenCalledWith('user-1', 'conv-1');
      expect(result).toBe(true);
    });

    it('returns false when the conversation does not belong to the user', async () => {
      mockRepo.verifyOwnership.mockResolvedValue(false);

      const result = await service.verifyOwnership('user-1', 'conv-other');

      expect(result).toBe(false);
    });
  });
});

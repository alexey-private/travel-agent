import { Pool } from 'pg';
import { UserRepository } from '../repositories/UserRepository';

/**
 * Service layer for user identity management.
 * Delegates persistence to UserRepository.
 */
export class UserService {
  private repo: UserRepository;

  constructor(pool: Pool) {
    this.repo = new UserRepository(pool);
  }

  /**
   * Finds or creates a user record identified by their session cookie / localStorage id.
   * @returns The internal user UUID
   */
  async findOrCreateUser(sessionId: string): Promise<string> {
    return this.repo.findOrCreateUser(sessionId);
  }

  /**
   * Returns true if the conversation belongs to the given user.
   */
  async verifyOwnership(userId: string, conversationId: string): Promise<boolean> {
    return this.repo.verifyOwnership(userId, conversationId);
  }
}

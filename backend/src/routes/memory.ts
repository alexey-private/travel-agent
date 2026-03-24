import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/client';
import { UserService } from '../services/UserService';
import { MemoryService } from '../services/MemoryService';

interface UserIdParam {
  /** Client-side session ID stored in localStorage */
  userId: string;
}

interface MemoryKeyParam extends UserIdParam {
  key: string;
}

/**
 * Memory management routes.
 *
 *   GET    /api/memory/:userId        → { memories: UserMemory[] }
 *   DELETE /api/memory/:userId/:key   → 204 No Content
 */
export async function memoryRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Returns all stored memories for the given user session.
   * Creates an empty user record if one does not yet exist.
   */
  fastify.get<{ Params: UserIdParam }>(
    '/api/memory/:userId',
    async (request: FastifyRequest<{ Params: UserIdParam }>, reply: FastifyReply) => {
      const { userId: sessionId } = request.params;

      const pool = getPool();
      const userService = new UserService(pool);
      const memoryService = new MemoryService(pool);

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const memories = await memoryService.getMemories(internalUserId);

      return reply.send({ memories });
    },
  );

  /**
   * Deletes a single memory key for the given user session.
   * Returns 204 No Content on success.
   */
  fastify.delete<{ Params: MemoryKeyParam }>(
    '/api/memory/:userId/:key',
    async (request: FastifyRequest<{ Params: MemoryKeyParam }>, reply: FastifyReply) => {
      const { userId: sessionId, key } = request.params;

      const pool = getPool();
      const userService = new UserService(pool);
      const memoryService = new MemoryService(pool);

      const internalUserId = await userService.findOrCreateUser(sessionId);
      await memoryService.deleteMemory(internalUserId, key);

      return reply.status(204).send();
    },
  );
}

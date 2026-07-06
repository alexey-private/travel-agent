import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/UserService';
import { MemoryService } from '../services/MemoryService';

interface UserIdParam {
  /** Client-side session ID stored in localStorage */
  userId: string;
}

interface MemoryKeyParam extends UserIdParam {
  key: string;
}

interface MemoryRouteOptions {
  userService: UserService;
  memoryService: MemoryService;
}

/**
 * Memory management routes.
 *
 *   GET    /api/memory/:userId        → { memories: UserMemory[] }
 *   DELETE /api/memory/:userId/:key   → 204 No Content
 */
export async function memoryRoutes(fastify: FastifyInstance, { userService, memoryService }: MemoryRouteOptions): Promise<void> {
  /**
   * Returns all stored memories for the given user session.
   * Creates an empty user record if one does not yet exist.
   */
  fastify.get<{ Params: UserIdParam; Querystring: { agentType?: string } }>(
    '/api/memory/:userId',
    async (request: FastifyRequest<{ Params: UserIdParam; Querystring: { agentType?: string } }>, reply: FastifyReply) => {
      const { userId: sessionId } = request.params;
      const agentType = request.query.agentType === 'shopping' ? 'shopping' : 'travel';

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const memories = await memoryService.getMemories(internalUserId, agentType);

      return reply.send({ memories });
    },
  );

  /**
   * Deletes a single memory key for the given user session.
   * Returns 204 No Content on success.
   */
  fastify.delete<{ Params: MemoryKeyParam; Querystring: { agentType?: string } }>(
    '/api/memory/:userId/:key',
    async (request: FastifyRequest<{ Params: MemoryKeyParam; Querystring: { agentType?: string } }>, reply: FastifyReply) => {
      const { userId: sessionId, key } = request.params;
      const agentType = request.query.agentType === 'shopping' ? 'shopping' : 'travel';

      const internalUserId = await userService.findOrCreateUser(sessionId);
      await memoryService.deleteMemory(internalUserId, key, agentType);

      return reply.status(204).send();
    },
  );
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/client';
import { ConversationService } from '../services/ConversationService';

export async function conversationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { userId: string } }>(
    '/api/conversations/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId: sessionId } = request.params;
      const pool = getPool();
      const conversationService = new ConversationService(pool);

      const internalUserId = await conversationService.findOrCreateUser(sessionId);
      const conversations = await conversationService.listConversations(internalUserId);

      return reply.send({ conversations });
    },
  );
}

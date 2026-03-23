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

  fastify.get<{ Params: { userId: string; conversationId: string } }>(
    '/api/conversations/:userId/:conversationId/messages',
    async (
      request: FastifyRequest<{ Params: { userId: string; conversationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { userId: sessionId, conversationId } = request.params;
      const pool = getPool();
      const conversationService = new ConversationService(pool);

      const internalUserId = await conversationService.findOrCreateUser(sessionId);

      // Verify ownership before reading messages
      const owned = await conversationService.verifyOwnership(internalUserId, conversationId);
      if (!owned) return reply.status(403).send({ error: 'Forbidden' });

      const history = await conversationService.getHistory(conversationId);
      return reply.send({ messages: history });
    },
  );
}

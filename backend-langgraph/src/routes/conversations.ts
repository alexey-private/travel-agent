import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/UserService';
import { ConversationService } from '../services/ConversationService';

interface ConversationRouteOptions {
  userService: UserService;
  conversationService: ConversationService;
}

export async function conversationRoutes(fastify: FastifyInstance, { userService, conversationService }: ConversationRouteOptions): Promise<void> {
  fastify.get<{ Params: { userId: string }; Querystring: { agentType?: string } }>(
    '/api/conversations/:userId',
    async (request: FastifyRequest<{ Params: { userId: string }; Querystring: { agentType?: string } }>, reply: FastifyReply) => {
      const { userId: sessionId } = request.params;
      const agentType = request.query.agentType === 'shopping' ? 'shopping' : 'travel';

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const conversations = await conversationService.listConversations(internalUserId, agentType);

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

      const internalUserId = await userService.findOrCreateUser(sessionId);

      const owned = await userService.verifyOwnership(internalUserId, conversationId);
      if (!owned) return reply.status(403).send({ error: 'Forbidden' });

      const history = await conversationService.getHistory(conversationId);
      return reply.send({ messages: history });
    },
  );

  fastify.delete<{ Params: { userId: string; conversationId: string } }>(
    '/api/conversations/:userId/:conversationId',
    async (
      request: FastifyRequest<{ Params: { userId: string; conversationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { userId: sessionId, conversationId } = request.params;

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const owned = await userService.verifyOwnership(internalUserId, conversationId);
      if (!owned) return reply.status(403).send({ error: 'Forbidden' });

      await conversationService.deleteConversation(conversationId);
      return reply.status(204).send();
    },
  );

  fastify.delete<{ Params: { userId: string; conversationId: string } }>(
    '/api/conversations/:userId/:conversationId/messages',
    async (
      request: FastifyRequest<{ Params: { userId: string; conversationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { userId: sessionId, conversationId } = request.params;

      const internalUserId = await userService.findOrCreateUser(sessionId);
      const owned = await userService.verifyOwnership(internalUserId, conversationId);
      if (!owned) return reply.status(403).send({ error: 'Forbidden' });

      await conversationService.clearMessages(conversationId);
      return reply.status(204).send();
    },
  );
}

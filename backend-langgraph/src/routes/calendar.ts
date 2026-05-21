import { FastifyInstance } from 'fastify';
import { CalendarProvider } from '../tools/providers/CalendarProvider';
import { TasksProvider } from '../tools/providers/TasksProvider';

interface CalendarRouteOptions {
  calendarProvider: CalendarProvider;
  tasksProvider: TasksProvider;
}

export async function calendarRoutes(
  fastify: FastifyInstance,
  opts: CalendarRouteOptions,
): Promise<void> {
  const { calendarProvider, tasksProvider } = opts;

  // ── Events ────────────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { userId?: string } }>('/api/calendar/events', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.code(400).send({ error: 'userId required' });
    const result = await calendarProvider.list({ userId });
    if (!result.success) return reply.code(500).send({ error: result.error });
    return result.data;
  });

  fastify.post<{ Querystring: { userId?: string }; Body: Record<string, unknown> }>(
    '/api/calendar/events',
    async (req, reply) => {
      const { userId } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const { title, date, endDate, time, description, category } = req.body ?? {};
      if (!title || !date) return reply.code(400).send({ error: 'title and date are required' });
      const result = await calendarProvider.add({
        userId,
        title: title as string,
        date: date as string,
        endDate: endDate as string | undefined,
        time: time as string | undefined,
        description: description as string | undefined,
        category: (category as string) ?? 'other',
      });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  fastify.patch<{ Params: { id: string }; Querystring: { userId?: string }; Body: Record<string, unknown> }>(
    '/api/calendar/events/:id',
    async (req, reply) => {
      const { userId } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const { title, date, endDate, time, description, category } = req.body ?? {};
      const result = await calendarProvider.update({
        userId,
        eventId: req.params.id,
        title: title as string | undefined,
        date: date as string | undefined,
        endDate: endDate as string | undefined,
        time: time as string | undefined,
        description: description as string | undefined,
        category: category as string | undefined,
      });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  fastify.delete<{ Params: { id: string }; Querystring: { userId?: string } }>(
    '/api/calendar/events/:id',
    async (req, reply) => {
      const { userId } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const result = await calendarProvider.delete({ userId, eventId: req.params.id });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  // ── Tasks ─────────────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { userId?: string; tasklistName?: string; includeCompleted?: string } }>(
    '/api/calendar/tasks',
    async (req, reply) => {
      const { userId, tasklistName, includeCompleted } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const result = await tasksProvider.list({
        userId,
        tasklistName,
        includeCompleted: includeCompleted === 'true',
      });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  fastify.post<{ Querystring: { userId?: string }; Body: Record<string, unknown> }>(
    '/api/calendar/tasks',
    async (req, reply) => {
      const { userId } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const { title, notes, due, tasklistName } = req.body ?? {};
      if (!title) return reply.code(400).send({ error: 'title is required' });
      if (!due) return reply.code(400).send({ error: 'due date is required' });
      const result = await tasksProvider.add({
        userId,
        title: title as string,
        notes: notes as string | undefined,
        due: due as string,
        tasklistName: tasklistName as string | undefined,
      });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  fastify.patch<{ Params: { id: string }; Querystring: { userId?: string }; Body: Record<string, unknown> }>(
    '/api/calendar/tasks/:id',
    async (req, reply) => {
      const { userId } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const { title, notes, due, tasklistName } = req.body ?? {};
      const result = await tasksProvider.update({
        userId,
        taskId: req.params.id,
        title: title as string | undefined,
        notes: notes as string | undefined,
        due: due as string | undefined,
        tasklistName: tasklistName as string | undefined,
      });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  fastify.post<{ Params: { id: string }; Querystring: { userId?: string; tasklistName?: string } }>(
    '/api/calendar/tasks/:id/complete',
    async (req, reply) => {
      const { userId, tasklistName } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const result = await tasksProvider.complete({ userId, taskId: req.params.id, tasklistName });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );

  fastify.delete<{ Params: { id: string }; Querystring: { userId?: string; tasklistName?: string } }>(
    '/api/calendar/tasks/:id',
    async (req, reply) => {
      const { userId, tasklistName } = req.query;
      if (!userId) return reply.code(400).send({ error: 'userId required' });
      const result = await tasksProvider.delete({ userId, taskId: req.params.id, tasklistName });
      if (!result.success) return reply.code(500).send({ error: result.error });
      return result.data;
    },
  );
}

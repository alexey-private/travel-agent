import Fastify, { FastifyInstance } from 'fastify';
import { exportRoutes } from '@/routes/export';

/**
 * Error responses carry a machine-readable `code` next to the English `error`.
 *
 * The frontend shows some of these straight to the user, with no agent in between
 * to translate them; `code` is what it looks the translation up by. `error` keeps
 * its English text so existing consumers and logs are unaffected.
 */
describe('error responses carry a machine-readable code', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(exportRoutes, {});
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a code alongside the English message for a missing body field', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/export/pdf', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'text is required', code: 'text_required' });
  });

  it('returns a code when Drive is not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf-to-drive',
      payload: { text: 'hello', userId: 'u1' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('drive_not_configured');
  });
});

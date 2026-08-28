import Fastify, { FastifyInstance } from 'fastify';
import { transcribeRoutes } from '@/routes/transcribe';

jest.mock('@/config/env', () => ({ env: { OPENAI_API_KEY: 'test-key' } }));

describe('POST /api/transcribe — language hint', () => {
  let app: FastifyInstance;
  let capturedForm: FormData;

  beforeEach(async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedForm = init.body as FormData;
      return Promise.resolve({ ok: true, json: async () => ({ text: 'שלום' }) });
    }) as unknown as typeof fetch;

    app = Fastify();
    await app.register(transcribeRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('forwards a supported language to Whisper', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm', language: 'he' },
    });
    expect(res.statusCode).toBe(200);
    expect(capturedForm.get('language')).toBe('he');
  });

  it('omits the hint when no language is given', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm' },
    });
    expect(capturedForm.get('language')).toBeNull();
  });

  it('omits the hint when the language is not supported', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/webm', language: 'de' },
    });
    expect(capturedForm.get('language')).toBeNull();
  });
});

import { FastifyInstance } from 'fastify';
import { env } from '../config/env';

interface TranscribeBody {
  audio: string;   // base64-encoded audio
  mimeType: string;
}

export async function transcribeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: TranscribeBody }>('/api/transcribe', async (req, reply) => {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return reply.status(503).send({ error: 'OPENAI_API_KEY is not configured on the server' });
    }

    const { audio, mimeType } = req.body ?? {};
    if (!audio || !mimeType) {
      return reply.status(400).send({ error: 'audio (base64) and mimeType are required' });
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `voice.${ext}`);
    form.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      fastify.log.error(`[transcribe] Whisper error ${res.status}: ${body}`);
      return reply.status(502).send({ error: `Whisper API error: ${res.status}` });
    }

    const json = await res.json() as { text: string };
    return reply.send({ text: json.text.trim() });
  });
}

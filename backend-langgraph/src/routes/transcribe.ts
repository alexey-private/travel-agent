import { FastifyInstance } from 'fastify';
import { env } from '../config/env';
import { isLocale } from '@travel-agent/i18n';

interface TranscribeBody {
  audio: string;   // base64-encoded audio
  mimeType: string;
  language?: string;
}

export async function transcribeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: TranscribeBody }>('/api/transcribe', async (req, reply) => {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return reply.status(503).send({ error: 'OPENAI_API_KEY is not configured on the server', code: 'transcribe_not_configured' });
    }

    const { audio, mimeType, language } = req.body ?? {};
    if (!audio || !mimeType) {
      return reply.status(400).send({ error: 'audio (base64) and mimeType are required', code: 'transcribe_input_required' });
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `voice.${ext}`);
    form.append('model', 'whisper-1');
    // Whisper auto-detects, but short Hebrew clips are routinely mis-detected and come
    // back transliterated into Latin script. An explicit hint costs nothing. Anything
    // outside the supported set is dropped rather than forwarded: Whisper rejects an
    // unknown code outright, which would turn a bad hint into a failed transcription.
    if (isLocale(language)) form.append('language', language);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      fastify.log.error(`[transcribe] Whisper error ${res.status}: ${body}`);
      return reply.status(502).send({ error: `Whisper API error: ${res.status}`, code: 'transcribe_upstream_error' });
    }

    const json = await res.json() as { text: string };
    return reply.send({ text: json.text.trim() });
  });
}

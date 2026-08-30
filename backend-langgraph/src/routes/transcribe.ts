import { FastifyInstance } from 'fastify';
import { env } from '../config/env';
import { isLocale } from '../i18n/locale';
import { rateLimitKey } from '../security/rateLimitKey';

interface TranscribeBody {
  audio: string;   // base64-encoded audio
  mimeType: string;
  language?: string;
  /**
   * Read by nothing in this handler — the Telegram bridge sends it, and the two
   * hooks that run before the route do the reading: `rateLimitKey` counts a
   * `tg-` id per user instead of putting the whole bot on one address, and
   * `registerInternalAuth` demands the bridge secret of anything naming such an
   * id. A web caller sends no `userId` here and is counted by address.
   */
  userId?: string;
}

/**
 * The largest clip that will be sent to Whisper.
 *
 * The rate limit bounds how often this route may be called; it says nothing
 * about what one call costs, and Whisper is billed by the minute of audio. The
 * request limit alone would allow a 25 MB body — hours of speech at the bitrate
 * a browser records at — twenty times a minute. 10 MB is far more than the
 * voice note this endpoint exists for and still well inside Whisper's own
 * 25 MB file limit. Measured after decoding, because base64 is what arrives.
 */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function transcribeRoutes(fastify: FastifyInstance): Promise<void> {
  // Every call spends the OpenAI key on a body of up to 25 MB, so this route is
  // limited whether or not the caller ever reaches the agent. 20 a minute is far
  // above what dictating into the chat looks like and far below what a script
  // billing us costs.
  fastify.post<{ Body: TranscribeBody }>(
    '/api/transcribe',
    { config: { rateLimit: { max: 20, timeWindow: 60_000, keyGenerator: rateLimitKey } } },
    async (req, reply) => {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: 'OPENAI_API_KEY is not configured on the server', code: 'transcribe_not_configured' });
      }

      const { audio, mimeType, language } = req.body ?? {};
      if (!audio || !mimeType) {
        return reply.status(400).send({ error: 'audio (base64) and mimeType are required', code: 'transcribe_input_required' });
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      if (audioBuffer.length > MAX_AUDIO_BYTES) {
        return reply.status(413).send({
          error: `audio must be at most ${MAX_AUDIO_BYTES} bytes once decoded`,
          code: 'audio_too_large',
        });
      }

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
    },
  );
}

import { BACKEND_URL } from './config';
import { internalHeaders } from './backendAuth';
import type { Locale } from '@travel-agent/i18n';
import type { TKey } from './i18n/dictionaries';

/**
 * Transcribing a Telegram voice note.
 *
 * The bot used to call Whisper itself, with its own copy of the OpenAI key and
 * no `language` field. That second copy is what made the bug possible: the hint
 * exists because Whisper mis-detects short Hebrew clips and hands them back
 * transliterated into Latin script, and `/api/transcribe` has sent it since the
 * web mic button was built. A voice note to the bot went the other way and got
 * the mis-detection. Asking the backend instead is what makes the two surfaces
 * one path — and leaves the paid key in one place.
 *
 * `userId` is in the body for two reasons, neither of them the transcription
 * itself: it is what the backend's rate limiter counts against (without it the
 * whole bot shares one bucket, since every request arrives from this one
 * process), and naming a `tg-` id is what makes the request Telegram-scoped, so
 * it needs `internalHeaders()` like every other call this bridge makes.
 */

/** Telegram sends voice notes as OGG/Opus, always. */
const VOICE_MIME_TYPE = 'audio/ogg';

/**
 * What the user reads when the backend refuses the clip.
 *
 * The backend answers in English and names the failure in a `code`; the bot has
 * its own three dictionaries, so it translates by the code rather than
 * forwarding the sentence. A code with no entry here — an upstream Whisper
 * error, a missing bridge secret — falls back to the generic failure, and the
 * detail goes to the log, where whoever runs the server can use it.
 */
const FAILURE_KEY_BY_CODE: Record<string, TKey> = {
  transcribe_not_configured: 'chat.voiceNeedsKey',
  audio_too_large: 'chat.voiceTooLong',
  rate_limited: 'chat.voiceTooMany',
};

const GENERIC_FAILURE: TKey = 'chat.voiceTranscribeFailed';

export type Transcription =
  | { ok: true; text: string }
  | { ok: false; key: TKey };

/**
 * Sends the clip to the backend and returns either what was said or the key of
 * the message to show. Never throws: the caller is a grammY handler with a
 * reply to send either way.
 */
export async function transcribeVoice(
  audio: Buffer,
  userId: string,
  language: Locale,
): Promise<Transcription> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/transcribe`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        audio: audio.toString('base64'),
        mimeType: VOICE_MIME_TYPE,
        language,
        userId,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      console.error('[transcribe]', res.status, body.code ?? '', body.error ?? '');
      return { ok: false, key: FAILURE_KEY_BY_CODE[body.code ?? ''] ?? GENERIC_FAILURE };
    }

    const { text } = (await res.json()) as { text: string };
    return { ok: true, text: text.trim() };
  } catch (err) {
    // The backend was unreachable. That message is written for whoever runs the
    // server — a hostname, a refused connection — and means nothing to the
    // person who just recorded a voice note.
    console.error('[transcribe]', err);
    return { ok: false, key: GENERIC_FAILURE };
  }
}

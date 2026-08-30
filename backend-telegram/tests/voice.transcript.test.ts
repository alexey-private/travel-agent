/**
 * The voice path: a Telegram voice note goes to the backend's `/api/transcribe`,
 * not to Whisper directly.
 *
 * The route it now uses has sent the `language` hint since the web mic button
 * was built — Whisper mis-detects short Hebrew clips and returns them
 * transliterated into Latin — and the bot's own call sent none. What the bot
 * has to get right is the request it makes (the hint, the id the limit counts
 * against, the bridge secret) and the answer it renders (its own three
 * dictionaries, never the backend's English sentence).
 */

jest.mock('../src/config', () => ({
  BACKEND_URL: 'http://backend.test',
  INTERNAL_API_SECRET: 'test-secret',
}));

// The transcript is handed straight to the agent afterwards; that round trip
// is not what this test is about.
jest.mock('../src/sse-client', () => ({
  // eslint-disable-next-line require-yield
  streamChat: jest.fn(async function* () { return; }),
}));

import type { Bot } from 'grammy';
import type { BotContext } from '../src/types';
import type { Locale } from '../src/i18n/config';
import { registerChatHandler } from '../src/chat.handler';
import { t } from '../src/i18n/t';
import { makeCtx } from './commands/helpers';

/** Captures the handlers registered via bot.on(), keyed by their filter. */
function captureOnHandlers(): Map<string, (ctx: BotContext) => Promise<void>> {
  const handlers = new Map<string, (ctx: BotContext) => Promise<void>>();
  const mockBot = {
    on: (filter: string, handler: (ctx: BotContext) => Promise<void>) => {
      handlers.set(filter, handler);
    },
    command: () => {},
  } as unknown as Bot<BotContext>;
  registerChatHandler(mockBot);
  return handlers;
}

const globalFetch = global.fetch;

type BackendAnswer =
  | { text: string }
  | { status: number; code?: string; error?: string }
  | { unreachable: true };

/**
 * Answers the two calls the voice handler makes: the Telegram file download,
 * and the transcription request this suite is about.
 */
function mockBackend(answer: BackendAnswer): void {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (!url.includes('/api/transcribe')) {
      // The Telegram file download.
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    }
    if ('unreachable' in answer) return Promise.reject(new Error('connect ECONNREFUSED backend.test:3002'));
    if ('text' in answer) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: answer.text }) });
    return Promise.resolve({
      ok: false,
      status: answer.status,
      json: () => Promise.resolve({ code: answer.code, error: answer.error }),
    });
  });
}

/** The body of the transcription request, parsed. */
function transcribeRequest(): { url: string; init: RequestInit } {
  const call = (global.fetch as jest.Mock).mock.calls
    .find(([url]: [string]) => url.includes('/api/transcribe'));
  expect(call).toBeDefined();
  return { url: call[0], init: call[1] };
}

function requestBody(): Record<string, unknown> {
  return JSON.parse(transcribeRequest().init.body as string) as Record<string, unknown>;
}

function voiceCtx(locale: Locale = 'en'): BotContext {
  const ctx = makeCtx({ locale });
  const withVoice = ctx as unknown as {
    message: { voice: { file_id: string } };
    api: { getFile: jest.Mock };
  };
  withVoice.message = { voice: { file_id: 'v1' } };
  withVoice.api.getFile = jest.fn().mockResolvedValue({ file_path: 'voice/v1.ogg' });
  return ctx;
}

/** Runs the voice handler end to end and hands back the context it replied on. */
async function sendVoice(locale: Locale = 'en'): Promise<BotContext> {
  const handlers = captureOnHandlers();
  const ctx = voiceCtx(locale);
  await handlers.get('message:voice')!(ctx);
  return ctx;
}

/** Every string the bot replied with, in order. */
function replies(ctx: BotContext): string[] {
  return (ctx.reply as unknown as jest.Mock).mock.calls.map(([text]: [string]) => text);
}

beforeEach(() => {
  // The failure paths log the detail for whoever runs the server; the suite
  // exercises all of them and there is no need to read it here.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = globalFetch;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('the transcription request', () => {
  it('sends the language the bot is speaking, which is the whole point of the route', async () => {
    mockBackend({ text: 'תזמין לי טיסה' });

    await sendVoice('he');

    expect(requestBody().language).toBe('he');
  });

  it('names the user, so one person cannot spend the whole bot\'s budget', async () => {
    // The backend keys the limit on a `tg-` id when it sees one, and on the
    // caller's address otherwise — and every request here arrives from this one
    // bridge process, so an anonymous body would put every Telegram user in one
    // bucket.
    mockBackend({ text: 'book a flight' });

    await sendVoice();

    expect(requestBody().userId).toBe('tg-42');
  });

  it('carries the bridge secret, without which naming that id is a 403', async () => {
    mockBackend({ text: 'book a flight' });

    await sendVoice();

    const headers = transcribeRequest().init.headers as Record<string, string>;
    expect(headers['x-internal-secret']).toBe('test-secret');
  });

  it('never calls OpenAI itself — the paid key lives on the backend now', async () => {
    mockBackend({ text: 'book a flight' });

    await sendVoice();

    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
    expect(urls.some((url) => url.includes('openai.com'))).toBe(false);
    expect(urls.some((url) => url.startsWith('http://backend.test/api/transcribe'))).toBe(true);
  });

  it('sends the clip as base64 with the mime type Telegram records in', async () => {
    mockBackend({ text: 'book a flight' });

    await sendVoice();

    const body = requestBody();
    expect(body.mimeType).toBe('audio/ogg');
    expect(typeof body.audio).toBe('string');
    expect(body.audio).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  });
});

describe('what the user reads back', () => {
  it('escapes markup characters in what Whisper heard', async () => {
    // Whisper writes whatever it heard, so "R and D" comes back as "R&D" and
    // the echo is a message Telegram rejects.
    mockBackend({ text: 'book R&D <team> a flight' });

    const ctx = await sendVoice();

    expect(ctx.reply).toHaveBeenCalledWith(
      '🎤 <i>book R&amp;D &lt;team&gt; a flight</i>',
      { parse_mode: 'HTML' },
    );
  });

  it('says nothing was understood when the transcript is empty', async () => {
    mockBackend({ text: '   ' });

    const ctx = await sendVoice();

    expect(replies(ctx)).toEqual([t('en', 'chat.voiceEmpty')]);
  });

  it('translates a refusal instead of forwarding the backend\'s English', async () => {
    mockBackend({ status: 413, code: 'audio_too_large', error: 'audio must be at most 10485760 bytes once decoded' });

    const ctx = await sendVoice('ru');

    expect(replies(ctx)).toEqual([t('ru', 'chat.voiceTooLong')]);
    expect(replies(ctx)[0]).not.toContain('10485760');
  });

  it('explains a rate limit, which the bot could not hit before this route', async () => {
    mockBackend({ status: 429, code: 'rate_limited', error: 'Too many requests' });

    const ctx = await sendVoice('he');

    expect(replies(ctx)).toEqual([t('he', 'chat.voiceTooMany')]);
  });

  it('reports a server with no OpenAI key as the misconfiguration it is', async () => {
    mockBackend({ status: 503, code: 'transcribe_not_configured', error: 'OPENAI_API_KEY is not configured on the server' });

    const ctx = await sendVoice();

    expect(replies(ctx)).toEqual([t('en', 'chat.voiceNeedsKey')]);
  });

  it('falls back to a plain failure for a code it does not know', async () => {
    mockBackend({ status: 502, code: 'transcribe_upstream_error', error: 'Whisper API error: 502' });

    const ctx = await sendVoice();

    expect(replies(ctx)).toEqual([t('en', 'chat.voiceTranscribeFailed')]);
    expect(replies(ctx)[0]).not.toContain('502');
  });

  it('keeps an unreachable backend in the log, not in the chat', async () => {
    mockBackend({ unreachable: true });

    const ctx = await sendVoice();

    expect(replies(ctx)).toEqual([t('en', 'chat.voiceTranscribeFailed')]);
    expect(replies(ctx)[0]).not.toContain('ECONNREFUSED');
  });
});

/**
 * The voice handler echoes the Whisper transcript back to the chat inside
 * `<i>…</i>` with `parse_mode: 'HTML'`. Whisper writes whatever it heard, so
 * "R and D" comes back as "R&D" and the echo is a message Telegram rejects.
 */

jest.mock('../src/config', () => ({ BACKEND_URL: 'http://localhost:3002' }));

// The transcript is handed straight to the agent afterwards; that round trip
// is not what this test is about.
jest.mock('../src/sse-client', () => ({
  // eslint-disable-next-line require-yield
  streamChat: jest.fn(async function* () { return; }),
}));

import type { Bot } from 'grammy';
import type { BotContext } from '../src/types';
import { registerChatHandler } from '../src/chat.handler';
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
const previousKey = process.env.OPENAI_API_KEY;

function mockTranscription(text: string): void {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('api.openai.com')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ text }) });
    }
    // The Telegram file download.
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  });
}

function voiceCtx(): BotContext {
  const ctx = makeCtx();
  const withVoice = ctx as unknown as {
    message: { voice: { file_id: string } };
    api: { getFile: jest.Mock };
  };
  withVoice.message = { voice: { file_id: 'v1' } };
  withVoice.api.getFile = jest.fn().mockResolvedValue({ file_path: 'voice/v1.ogg' });
  return ctx;
}

beforeAll(() => { process.env.OPENAI_API_KEY = 'test-key'; });
afterAll(() => {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});
afterEach(() => {
  global.fetch = globalFetch;
  jest.clearAllMocks();
});

describe('voice transcript echo', () => {
  it('escapes markup characters in what Whisper heard', async () => {
    const handlers = captureOnHandlers();
    const ctx = voiceCtx();
    mockTranscription('book R&D <team> a flight');

    await handlers.get('message:voice')!(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      '🎤 <i>book R&amp;D &lt;team&gt; a flight</i>',
      { parse_mode: 'HTML' },
    );
  });
});

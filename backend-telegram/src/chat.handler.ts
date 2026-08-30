import type { Bot } from 'grammy';
import type { BotContext } from './types';
import { streamChat, type Attachment } from './sse-client';
import { setCalendarDispatch } from './commands/calendar';
import { setTasksDispatch } from './commands/tasks';
import { buildSuggestionsKeyboard } from './commands/start';
import { ensureSessionId } from './session';
import { escapeHtml, renderHtml } from './render';
import { getLocale, tFor, tIn } from './i18n/language';
import { transcribeVoice } from './transcribe';

const MAX_TG_LENGTH = 4096;
const EDIT_THROTTLE_MS = 1000;
const TYPING_INTERVAL_MS = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_TG_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_TG_LENGTH) {
    let cutAt = remaining.lastIndexOf('\n\n', MAX_TG_LENGTH);
    if (cutAt <= 0) cutAt = remaining.lastIndexOf('\n', MAX_TG_LENGTH);
    if (cutAt <= 0) cutAt = MAX_TG_LENGTH;
    chunks.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export async function handleChatMessage(ctx: BotContext, userText: string, attachments?: Attachment[]): Promise<void> {
  const chat = ctx.chat!;
  ensureSessionId(ctx);

  // The locale itself is needed further down, for the SSE request.
  const locale = await getLocale(ctx);
  const t = tIn(locale);

  const sent = await ctx.reply(t('common.thinking'));
  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chat.id, 'typing').catch(() => {});
  }, TYPING_INTERVAL_MS);
  await ctx.api.sendChatAction(chat.id, 'typing');

  let accumulated = '';
  let lastEdit = Date.now();
  let toolActivity = false;
  let pendingSuggestions: string[] = [];

  const messageWithLocation = ctx.session.currentCity && userText
    ? `[My current location: ${ctx.session.currentCity}] ${userText}`
    : userText;

  try {
    for await (const event of streamChat({
      sessionId: ctx.session.sessionId!,
      conversationId: ctx.session.conversationId,
      message: messageWithLocation,
      agentType: ctx.session.agentType,
      attachments,
      // Only for the error events this generator yields. It is deliberately
      // NOT sent in the chat body: /api/chat treats a body language as the
      // user's newest choice and writes it back, so a session cache that went
      // stale after a switch on the web would overwrite the fresher value.
      // The backend reads the stored preference under the same tg-<id> anyway.
      locale,
    })) {
      if (event.type === 'conversation_id') {
        ctx.session.conversationId = event.conversationId;
        continue;
      }

      if (event.type === 'text') {
        accumulated += event.content;
        const now = Date.now();
        if (now - lastEdit >= EDIT_THROTTLE_MS) {
          const preview = accumulated.slice(0, MAX_TG_LENGTH);
          await ctx.api.editMessageText(chat.id, sent.message_id, preview).catch(() => {});
          lastEdit = now;
        }
        continue;
      }

      if (event.type === 'tool_start') {
        if (!toolActivity) {
          await ctx.api
            .editMessageText(chat.id, sent.message_id, t('chat.usingTool', { tool: event.tool }), { parse_mode: 'HTML' })
            .catch(() => {});
          toolActivity = true;
        }
        continue;
      }

      if (event.type === 'suggestions') {
        pendingSuggestions = event.suggestions.slice(0, 4);
        continue;
      }

      if (event.type === 'error') {
        clearInterval(typingInterval);
        await ctx.api
          .editMessageText(chat.id, sent.message_id, event.message, { parse_mode: 'HTML' })
          .catch(() => {});
        return;
      }

      if (event.type === 'done') break;
    }

    clearInterval(typingInterval);

    const chunks = splitMessage(accumulated || t('chat.noResponse'));
    await ctx.api
      .editMessageText(chat.id, sent.message_id, renderHtml(chunks[0]), { parse_mode: 'HTML' })
      .catch(() => {});
    for (let i = 1; i < chunks.length; i++) {
      await ctx.reply(renderHtml(chunks[i]), { parse_mode: 'HTML' });
    }

    // Show dynamic follow-up suggestions as inline keyboard
    if (pendingSuggestions.length > 0) {
      const kb = buildSuggestionsKeyboard(pendingSuggestions, ctx);
      await ctx.reply(t('chat.nextStep'), { reply_markup: kb });
    }
  } catch (err) {
    clearInterval(typingInterval);
    const isConnectError = err instanceof TypeError && err.message.includes('fetch failed');
    const msg = isConnectError
      ? t('chat.backendUnreachable')
      : t('chat.failed', { message: err instanceof Error ? err.message : String(err) });
    console.error('[chat.handler]', err);
    await ctx.api
      .editMessageText(chat.id, sent.message_id, `⚠️ ${msg}`, { parse_mode: 'HTML' })
      .catch(() => {});
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN!;
const TG_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY!;
const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'text/plain']);
const MAX_FILE_SIZE_MB = 19;

async function downloadTelegramFile(fileId: string, ctx: BotContext): Promise<{ data: Buffer; path: string }> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error('Telegram did not return a file path');
  const url = `${TG_FILE_API}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf, path: file.file_path };
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = await res.json() as Array<{ name: string; country: string; state?: string }>;
  if (!data.length) throw new Error('Location not found');
  const { name, state, country } = data[0];
  return state ? `${name}, ${state}, ${country}` : `${name}, ${country}`;
}

export function registerChatHandler(bot: Bot<BotContext>): void {
  setCalendarDispatch(handleChatMessage);
  setTasksDispatch(handleChatMessage);

  // Location handler — reverse-geocode and store city in session
  bot.on('message:location', async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    const t = await tFor(ctx);
    const processing = await ctx.reply(t('chat.gettingLocation'));
    try {
      const city = await reverseGeocode(latitude, longitude);
      ctx.session.currentCity = city;
      await ctx.api.editMessageText(
        ctx.chat.id,
        processing.message_id,
        t('chat.locationSet', { city }),
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        processing.message_id,
        t('chat.locationFailed', { message: err instanceof Error ? err.message : String(err) }),
        { parse_mode: 'HTML' },
      );
    }
  });

  // Document handler — PDF and plain text files
  bot.on('message:document', async (ctx) => {
    const t = await tFor(ctx);
    const doc = ctx.message.document;
    const mimeType = doc.mime_type ?? 'application/octet-stream';
    const fileSize = doc.file_size ?? 0;

    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      await ctx.reply(t('chat.unsupportedFile', { mimeType }), { parse_mode: 'HTML' });
      return;
    }

    if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
      await ctx.reply(t('chat.fileTooLarge', { max: MAX_FILE_SIZE_MB }), { parse_mode: 'HTML' });
      return;
    }

    await ctx.api.sendChatAction(ctx.chat.id, 'upload_document');

    let fileData: Buffer;
    try {
      const { data } = await downloadTelegramFile(doc.file_id, ctx);
      fileData = data;
    } catch (err) {
      await ctx.reply(t('chat.fileDownloadFailed', { message: err instanceof Error ? err.message : String(err) }), { parse_mode: 'HTML' });
      return;
    }

    const attachment: Attachment = {
      name: doc.file_name ?? 'document.pdf',
      mimeType,
      base64: fileData.toString('base64'),
      size: fileData.length,
    };

    // Caption becomes the user message; fall back to empty string (backend fills in default)
    const caption = ctx.message.caption ?? '';
    await handleChatMessage(ctx, caption, [attachment]);
  });

  // Photo handler
  bot.on('message:photo', async (ctx) => {
    const t = await tFor(ctx);
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1]; // highest resolution

    await ctx.api.sendChatAction(ctx.chat.id, 'upload_photo');

    let fileData: Buffer;
    try {
      const { data } = await downloadTelegramFile(best.file_id, ctx);
      fileData = data;
    } catch (err) {
      await ctx.reply(t('chat.photoDownloadFailed', { message: err instanceof Error ? err.message : String(err) }), { parse_mode: 'HTML' });
      return;
    }

    const attachment: Attachment = {
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      base64: fileData.toString('base64'),
      size: fileData.length,
    };

    const caption = ctx.message.caption ?? '';
    await handleChatMessage(ctx, caption, [attachment]);
  });

  // Voice handler — transcribes through the backend, then sends text to agent
  bot.on('message:voice', async (ctx) => {
    // The transcription is a Telegram-scoped backend call, so it needs the id
    // before `handleChatMessage` would otherwise mint one.
    ensureSessionId(ctx);
    const locale = await getLocale(ctx);
    const t = tIn(locale);

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    let fileData: Buffer;
    try {
      const { data } = await downloadTelegramFile(ctx.message.voice.file_id, ctx);
      fileData = data;
    } catch (err) {
      await ctx.reply(t('chat.voiceDownloadFailed', { message: err instanceof Error ? err.message : String(err) }), { parse_mode: 'HTML' });
      return;
    }

    // The language this user is being spoken to in is the hint Whisper needs:
    // left to guess it returns a short Hebrew clip transliterated into Latin.
    const transcription = await transcribeVoice(fileData, ctx.session.sessionId!, locale);
    if (!transcription.ok) {
      await ctx.reply(t(transcription.key), { parse_mode: 'HTML' });
      return;
    }

    if (!transcription.text) {
      await ctx.reply(t('chat.voiceEmpty'));
      return;
    }

    await ctx.reply(`🎤 <i>${escapeHtml(transcription.text)}</i>`, { parse_mode: 'HTML' });
    await handleChatMessage(ctx, transcription.text);
  });

  // Catch-all text handler — MUST be registered last
  bot.on('message:text', async (ctx) => {
    if (!ctx.chat) return;

    if (ctx.chat.type !== 'private') {
      const botUsername = ctx.me.username;
      const text = ctx.message.text;
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      const isMention = !!botUsername && text.includes(`@${botUsername}`);
      if (!isReplyToBot && !isMention) return;
    }

    await handleChatMessage(ctx, ctx.message.text);
  });
}

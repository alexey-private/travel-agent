import type { Bot } from 'grammy';
import type { BotContext } from './types';
import { streamChat, type Attachment } from './sse-client';
import { setCalendarDispatch } from './commands/calendar';
import { setTasksDispatch } from './commands/tasks';
import { buildSuggestionsKeyboard } from './commands/start';
import { ensureSessionId } from './session';
import { renderHtml } from './render';

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

  const sent = await ctx.reply('...');
  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chat.id, 'typing').catch(() => {});
  }, TYPING_INTERVAL_MS);
  await ctx.api.sendChatAction(chat.id, 'typing');

  let accumulated = '';
  let lastEdit = Date.now();
  let toolActivity = false;
  let pendingSuggestions: string[] = [];

  try {
    for await (const event of streamChat({
      sessionId: ctx.session.sessionId!,
      conversationId: ctx.session.conversationId,
      message: userText,
      agentType: ctx.session.agentType,
      attachments,
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
            .editMessageText(chat.id, sent.message_id, `⚙️ Using <b>${event.tool}</b>…`, { parse_mode: 'HTML' })
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
          .editMessageText(chat.id, sent.message_id, `Sorry, something went wrong: ${event.message}`)
          .catch(() => {});
        return;
      }

      if (event.type === 'done') break;
    }

    clearInterval(typingInterval);

    const chunks = splitMessage(accumulated || '(no response)');
    await ctx.api
      .editMessageText(chat.id, sent.message_id, renderHtml(chunks[0]), { parse_mode: 'HTML' })
      .catch(() => {});
    for (let i = 1; i < chunks.length; i++) {
      await ctx.reply(renderHtml(chunks[i]), { parse_mode: 'HTML' });
    }

    // Show dynamic follow-up suggestions as inline keyboard
    if (pendingSuggestions.length > 0) {
      const kb = buildSuggestionsKeyboard(pendingSuggestions, ctx);
      await ctx.reply('What would you like to do next?', { reply_markup: kb });
    }
  } catch (err) {
    clearInterval(typingInterval);
    const isConnectError = err instanceof TypeError && err.message.includes('fetch failed');
    const msg = isConnectError
      ? 'Cannot reach the backend. Make sure backend-langgraph is running.'
      : err instanceof Error ? err.message : String(err);
    console.error('[chat.handler]', err);
    await ctx.api
      .editMessageText(chat.id, sent.message_id, `⚠️ ${msg}`)
      .catch(() => {});
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN!;
const TG_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;
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

export function registerChatHandler(bot: Bot<BotContext>): void {
  setCalendarDispatch(handleChatMessage);
  setTasksDispatch(handleChatMessage);

  // Document handler — PDF and plain text files
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const mimeType = doc.mime_type ?? 'application/octet-stream';
    const fileSize = doc.file_size ?? 0;

    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      await ctx.reply(`Unsupported file type: ${mimeType}.\nI can read PDF and plain text files.`);
      return;
    }

    if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
      await ctx.reply(`File is too large (max ${MAX_FILE_SIZE_MB} MB).`);
      return;
    }

    await ctx.api.sendChatAction(ctx.chat.id, 'upload_document');

    let fileData: Buffer;
    try {
      const { data } = await downloadTelegramFile(doc.file_id, ctx);
      fileData = data;
    } catch (err) {
      await ctx.reply(`Could not download the file: ${err instanceof Error ? err.message : String(err)}`);
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
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1]; // highest resolution

    await ctx.api.sendChatAction(ctx.chat.id, 'upload_photo');

    let fileData: Buffer;
    try {
      const { data } = await downloadTelegramFile(best.file_id, ctx);
      fileData = data;
    } catch (err) {
      await ctx.reply(`Could not download the photo: ${err instanceof Error ? err.message : String(err)}`);
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

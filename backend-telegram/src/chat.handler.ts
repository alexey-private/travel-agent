import type { Bot } from 'grammy';
import type { BotContext } from './types';
import { streamChat } from './sse-client';
import { setCalendarDispatch } from './commands/calendar';
import { ensureSessionId } from './session';

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

export async function handleChatMessage(ctx: BotContext, userText: string): Promise<void> {
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

  try {
    for await (const event of streamChat({
      sessionId: ctx.session.sessionId!,
      conversationId: ctx.session.conversationId,
      message: userText,
      agentType: ctx.session.agentType,
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
    await ctx.api.editMessageText(chat.id, sent.message_id, chunks[0]).catch(() => {});
    for (let i = 1; i < chunks.length; i++) {
      await ctx.reply(chunks[i]);
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
    // Don't re-throw — error already shown to user
  }
}

export function registerChatHandler(bot: Bot<BotContext>): void {
  // Wire /calendar dispatch now that the handler is available
  setCalendarDispatch(handleChatMessage);

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

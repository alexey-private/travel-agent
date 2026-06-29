import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { BACKEND_URL } from '../index';
import { ensureSessionId } from '../session';

const HISTORY_PAIRS = 5;
const MAX_MSG_LENGTH = 300;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export function registerHistoryCommand(bot: Bot<BotContext>): void {
  bot.command('history', async (ctx) => {
    ensureSessionId(ctx);

    const { sessionId, conversationId } = ctx.session;
    if (!conversationId) {
      await ctx.reply("No conversation history yet. Start chatting first!");
      return;
    }

    const processing = await ctx.reply('📋 Loading history…');

    let messages: Message[];
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/conversations/${encodeURIComponent(sessionId!)}/` +
        `${encodeURIComponent(conversationId)}/messages`,
      );
      if (!res.ok) throw new Error(`Backend error: ${res.status}`);
      const data = await res.json() as { messages: Message[] };
      messages = data.messages;
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        processing.message_id,
        `Could not load history: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    if (!messages.length) {
      await ctx.api.editMessageText(ctx.chat!.id, processing.message_id, 'No messages in this conversation yet.');
      return;
    }

    // Take last N pairs: find the last HISTORY_PAIRS*2 messages, keeping pairs intact
    const pairs: Array<[Message, Message]> = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'user' && messages[i + 1].role === 'assistant') {
        pairs.push([messages[i], messages[i + 1]]);
        i++; // skip assistant message
      }
    }
    const recent = pairs.slice(-HISTORY_PAIRS);

    if (!recent.length) {
      await ctx.api.editMessageText(ctx.chat!.id, processing.message_id, 'No complete message pairs found.');
      return;
    }

    const lines: string[] = [`<b>📋 Last ${recent.length} exchange${recent.length > 1 ? 's' : ''}:</b>\n`];
    for (const [user, assistant] of recent) {
      lines.push(`👤 <i>${truncate(user.content, MAX_MSG_LENGTH)}</i>`);
      lines.push(`🤖 ${truncate(assistant.content, MAX_MSG_LENGTH)}\n`);
    }

    const text = lines.join('\n');
    await ctx.api.editMessageText(ctx.chat!.id, processing.message_id, text, { parse_mode: 'HTML' });
  });
}

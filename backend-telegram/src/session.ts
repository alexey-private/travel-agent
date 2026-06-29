import { randomUUID } from 'crypto';
import type { BotContext } from './types';

/**
 * Ensures the session has a stable sessionId tied to this Telegram user.
 * We prefix with "tg-" so backend logs distinguish Telegram sessions from web sessions.
 * The same tg-<userId> string is always used for the same Telegram user,
 * so the backend's findOrCreateUser() call is idempotent.
 */
export function ensureSessionId(ctx: BotContext): void {
  if (!ctx.session.sessionId) {
    const telegramUserId = ctx.from?.id;
    ctx.session.sessionId = telegramUserId
      ? `tg-${telegramUserId}`
      : `tg-anon-${randomUUID()}`;
  }
}

import { BACKEND_URL } from '../config';
import { internalHeaders } from '../backendAuth';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';
import { t } from './t';
import type { TKey } from './dictionaries';
import type { TVars } from './types';
import type { BotContext } from '../types';

function settingsUrl(userId: string): string {
  return `${BACKEND_URL}/api/settings?userId=${encodeURIComponent(userId)}`;
}

/**
 * Reads the stored language for a session id.
 *
 * Returns null when the backend could not be asked at all, which the caller
 * needs to distinguish from a genuine answer: an unreachable backend must not
 * get cached as "this user speaks English".
 */
async function readLocale(userId: string): Promise<Locale | null> {
  try {
    const res = await fetch(settingsUrl(userId), { headers: internalHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { language?: unknown };
    // A user who never picked a language has no stored value — English then.
    return isLocale(data.language) ? data.language : DEFAULT_LOCALE;
  } catch {
    return null;
  }
}

/**
 * Reads the stored language for a session id, without a grammY context.
 *
 * The daily reminder cron has recipients but no `ctx`, so it resolves each
 * user's language through this.
 */
export async function fetchLocale(userId: string): Promise<Locale> {
  return (await readLocale(userId)) ?? DEFAULT_LOCALE;
}

/**
 * Resolves the user's language.
 *
 * The database is the source of truth — the same person may have picked Hebrew
 * on the web. The grammY session is only a per-process cache: it disappears on
 * restart, which is fine, the next call refetches.
 */
export async function getLocale(ctx: BotContext): Promise<Locale> {
  if (ctx.session.locale) return ctx.session.locale;

  const userId = ctx.session.sessionId;
  if (!userId) return DEFAULT_LOCALE;

  // Only a real answer is cached. A blip that pinned English on the session
  // would outlive the blip and keep answering the wrong language until restart.
  const locale = await readLocale(userId);
  if (locale === null) return DEFAULT_LOCALE;
  ctx.session.locale = locale;
  return locale;
}

export async function setLocale(ctx: BotContext, locale: Locale): Promise<void> {
  ctx.session.locale = locale;
  const userId = ctx.session.sessionId;
  if (!userId) return;

  try {
    await fetch(settingsUrl(userId), {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ language: locale }),
    });
  } catch {
    // The session cache still holds the choice for this process; the next
    // successful call will persist it.
  }
}

/** A translate function bound to one language. */
export type Translate = (key: TKey, vars?: TVars) => string;

/** Binds `t` to an already-resolved locale — for callers that also need the locale itself. */
export function tIn(locale: Locale): Translate {
  return (key: TKey, vars?: TVars) => t(locale, key, vars);
}

/** Convenience: a bound translate function for this user. */
export async function tFor(ctx: BotContext): Promise<Translate> {
  return tIn(await getLocale(ctx));
}

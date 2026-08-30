import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Guarding the Telegram half of the user-id namespace.
 *
 * A web visitor's session id is `crypto.randomUUID()` — unguessable, and that
 * unguessability is the only thing standing between a request and the data
 * behind it. A Telegram user's session id is `tg-<telegram user id>`, and a
 * Telegram user id is a public integer: anyone sharing a group with the person
 * has it. The same routes therefore protect one half of the namespace and
 * expose the other, and `/api/users/telegram` handed out the whole list of ids
 * to begin with, so the attacker did not even have to guess.
 *
 * Rewriting the ids would have been the other fix, and a worse one: they key
 * `google_tokens`, `icloud_tokens`, `user_service_preferences` and every
 * conversation, so changing them orphans everything a Telegram user has. What
 * changes instead is who may address them — only a caller holding the secret
 * the bot shares with this backend.
 *
 * Web ids are deliberately untouched: they are already unguessable, and the
 * browser has nowhere to keep a shared secret.
 */

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

const TELEGRAM_PREFIX = 'tg-';

/** Routes that exist only for the bridge, whatever ids they mention. */
const BOT_ONLY_PATHS = new Set(['/api/users/telegram']);

/**
 * The OAuth pair a *browser* follows while carrying a `tg-` id — the consent
 * link `/connect` sends. A header cannot reach these, so they check a signature
 * of their own instead (see `routes/auth.ts`), and the blanket rule here would
 * only lock the user out of connecting their calendar.
 */
const BROWSER_OAUTH_PATHS = new Set(['/auth/google/start', '/auth/google/callback']);

export function isTelegramUserId(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(TELEGRAM_PREFIX);
}

/**
 * Joins the parts of a signed payload so their boundaries cannot move.
 *
 * A plain `a|b|c` is ambiguous the moment any part may itself contain the
 * separator: two different tuples then produce one string, and one signature
 * covers both readings. Nothing currently reaching these signatures can contain
 * a `|` — but that is a property of today's callers, not of the format, and it
 * is the format that has to hold. Each part carries its own length instead.
 *
 * Mirrored by `canonicalPayload` in backend-telegram/src/backendAuth.ts; the two
 * must agree byte for byte or every /connect link is rejected.
 */
export function canonicalPayload(parts: readonly (string | number)[]): string {
  return parts.map((part) => {
    const text = String(part);
    return `${text.length}:${text}`;
  }).join('|');
}

/** HMAC-SHA256, hex. Used both for the request header and for the OAuth links. */
export function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Constant-time comparison of a presented signature against the expected one.
 *
 * `timingSafeEqual` throws on a length mismatch rather than returning false, so
 * the length is checked first — and compared over the hex text, which is fixed
 * width for every real signature.
 */
export function verifySignature(payload: string, presented: unknown, secret: string): boolean {
  if (typeof presented !== 'string') return false;
  const expected = sign(payload, secret);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

/**
 * Constant-time comparison of the presented header against the configured
 * secret. A length mismatch short-circuits — `timingSafeEqual` throws on
 * unequal lengths, and the length of a secret is not what protects it.
 */
function secretsMatch(presented: string, secret: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Every place a request can name a user, without assuming which one this route uses. */
function mentionsTelegramUser(req: FastifyRequest): boolean {
  for (const source of [req.params, req.query, req.body]) {
    if (typeof source !== 'object' || source === null) continue;
    if (isTelegramUserId((source as { userId?: unknown }).userId)) return true;
  }
  return false;
}

function presentedSecret(req: FastifyRequest): unknown {
  return req.headers[INTERNAL_SECRET_HEADER];
}

/**
 * Registers the guard. Must run before the routes it protects.
 *
 * `preHandler`, not `onRequest`: the body is parsed by then, which is the only
 * stage where `/api/chat`'s `userId` is readable. The rate limiter is on the
 * same hook for the same reason.
 */
export function registerInternalAuth(fastify: FastifyInstance, secret: string | undefined): void {
  if (!secret) {
    // Loud at boot rather than silent at request time: an unset secret means
    // the bot cannot talk to this backend at all, and that is a deployment
    // mistake worth seeing in the logs on the first line rather than in a
    // support ticket a week later.
    fastify.log.error(
      'INTERNAL_API_SECRET is not set — Telegram-scoped requests will be refused. ' +
      'Set the same value on backend-langgraph and backend-telegram.',
    );
  }

  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0];
    if (BROWSER_OAUTH_PATHS.has(path)) return;

    const needsSecret = BOT_ONLY_PATHS.has(path) || mentionsTelegramUser(req);
    if (!needsSecret) return;

    if (!secret) {
      return reply.code(503).send({
        error: 'The Telegram bridge is not configured on this server',
        code: 'internal_auth_not_configured',
      });
    }

    const presented = presentedSecret(req);
    if (typeof presented !== 'string' || !secretsMatch(presented, secret)) {
      req.log.warn({ path }, 'rejected a Telegram-scoped request without the bridge secret');
      return reply.code(403).send({
        error: 'This user id may only be addressed by the Telegram bridge',
        code: 'internal_auth_required',
      });
    }
  });
}

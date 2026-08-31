import { createHmac } from 'crypto';
import { INTERNAL_API_SECRET } from './config';

/**
 * Proving to the backend that a request really comes from this bridge.
 *
 * Every session id the bot uses is `tg-<telegram user id>`, derived from a
 * number anyone sharing a group with the person can read. The backend therefore
 * refuses to answer for those ids unless the caller holds the secret both
 * services are configured with — see `backend-langgraph/src/security/internalAuth.ts`
 * for why the ids were not simply rewritten instead.
 *
 * Every call the bot makes to the backend has to carry these headers. One that
 * forgets them does not fail quietly: the backend answers 403.
 */

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * Shorter than the ceiling the backend enforces, deliberately. The difference
 * is the clock skew the two services are allowed to have between them.
 */
const START_LINK_TTL_MS = 10 * 60 * 1000;

/**
 * Mirrors `canonicalPayload` in
 * backend-langgraph/src/security/internalAuth.ts — each part carries its own
 * length, so no value can move a field boundary. The two must agree byte for
 * byte or every /connect link is rejected.
 */
function canonicalPayload(parts: readonly (string | number)[]): string {
  return parts.map((part) => {
    const text = String(part);
    return `${text.length}:${text}`;
  }).join('|');
}

/** Request headers for a backend call, merged with whatever the caller needs. */
export function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return INTERNAL_API_SECRET
    ? { ...extra, [INTERNAL_SECRET_HEADER]: INTERNAL_API_SECRET }
    : extra;
}

/**
 * The proof that a `/connect` link was issued here.
 *
 * The consent link is followed by a browser, so it cannot carry a header — the
 * signature travels in the query string instead, over the id, the platform and
 * an expiry. Without it the link is just a public id in a URL, and opening one
 * for somebody else's Telegram account would attach the opener's Google
 * account to that person's session.
 */
export function signStartLink(userId: string, platform: string): { exp: number; sig: string } | null {
  if (!INTERNAL_API_SECRET) return null;
  const exp = Date.now() + START_LINK_TTL_MS;
  const sig = createHmac('sha256', INTERNAL_API_SECRET)
    .update(canonicalPayload([userId, platform, exp]))
    .digest('hex');
  return { exp, sig };
}

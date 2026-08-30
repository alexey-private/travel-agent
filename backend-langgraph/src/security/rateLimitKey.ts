import type { FastifyRequest } from 'fastify';

/**
 * Who a rate-limited request is counted against.
 *
 * Every limited route asks this one function, so the answer is defined in a
 * single place. That matters because the answer is currently wrong in a known
 * way: `userId` arrives in the request body, so a caller that rotates it walks
 * into a fresh bucket every time (S5 in the security audit). Keeping the rule
 * here means fixing it once rather than in every route that copied it.
 *
 * It is still the right default today. The alternative — keying on `req.ip`
 * alone — would put the entire Telegram user base, which reaches this backend
 * through one bridge process, into a single bucket, and behind a proxy that
 * Fastify is not configured to trust it would do the same to every web user.
 */
export function rateLimitKey(req: FastifyRequest): string {
  const userId = (req.body as { userId?: unknown } | null | undefined)?.userId;
  if (typeof userId === 'string' && userId.length > 0) return userId;
  return req.ip || 'unknown';
}

import type { FastifyRequest } from 'fastify';
import { isTelegramUserId } from './internalAuth';
import { clientAddress } from './trustProxy';

/**
 * Who a rate-limited request is counted against.
 *
 * Every limited route asks this one function, so the answer is defined in a
 * single place.
 *
 * A web `userId` cannot appear in the answer at all. It arrives in the request
 * body and nothing attests to it, so a caller who invents a new one per request
 * walks into a fresh bucket every time. Combining it with the address is no
 * better: it multiplies the budget by however many ids the caller cares to
 * invent. Web traffic is therefore counted per address, and the cost of that is
 * real — everyone behind one NAT shares one budget. The ceilings are set high
 * enough (30 chats, 20 transcriptions, 10 exports a minute) that a household or
 * a small office never reaches them.
 *
 * A `tg-` id is the exception, and it is why this is not simply `req.ip`. Those
 * requests reach this backend only through the bridge, and `registerInternalAuth`
 * — an instance-level `preHandler`, which Fastify runs before the route-level
 * one the limiter installs — has already refused any that did not carry the
 * shared secret. By the time the key is computed the id is attested rather than
 * claimed. Counting them by address instead would put every Telegram user into
 * a single bucket, since they all arrive from the one bridge process.
 *
 * The prefixes keep the two namespaces apart, so no id can be spelled to
 * collide with an address.
 */
export function rateLimitKey(req: FastifyRequest): string {
  const userId = (req.body as { userId?: unknown } | null | undefined)?.userId;
  if (isTelegramUserId(userId)) return `user:${userId}`;
  return `ip:${clientAddress(req)}`;
}

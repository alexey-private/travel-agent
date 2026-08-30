import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Which peers may speak for the caller through `X-Forwarded-For`.
 *
 * Behind a proxy the socket peer is the proxy, so `req.ip` — the key the rate
 * limiter counts a web caller by — is the same value for everyone unless the
 * proxy is trusted. The limit then stops bounding an attacker and starts
 * bounding the whole user base together.
 *
 * Trust is expressed as peers rather than a hop count for two reasons. Fastify
 * 5 refuses a numeric `trustProxy` outright — `getTrustProxyFn` returns
 * `() => false` for a number, since a hop count cannot tell whether the peer
 * itself is a proxy. And only the entry the trusted peer appended is believed:
 * a caller who prepends hops of their own is ignored, which is what stops the
 * header from becoming a second rotatable identifier.
 *
 * The default names every range a platform's edge proxy plausibly reaches a
 * container from and a public client cannot arrive from — the private ranges
 * plus carrier-grade NAT. Widening it to cover the caller's own address hands
 * the bypass back: with nothing left untrusted, `req.ip` is the first entry of
 * the chain, which the caller wrote. That has to be asked for deliberately —
 * the parser rejects `true` and a literal `0.0.0.0/0` alike, and a value it
 * cannot read stops the process at startup rather than degrading quietly.
 */
export const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal, 100.64.0.0/10';

/**
 * Servers that have already complained about an untrusted proxy. The condition
 * is a property of the deployment, not of one request, so it is worth saying
 * once per server and never again.
 */
const warned = new WeakSet<FastifyInstance>();

/**
 * The caller's address — and a loud warning when it is really the proxy's.
 *
 * A deploy whose edge proxy is missing from `TRUST_PROXY` is silent otherwise:
 * every request simply carries the same address, and the first sign of it is
 * users throttling each other. This log line is how one finds out instead.
 */
export function clientAddress(req: FastifyRequest): string {
  const ip = req.ip || 'unknown';
  if (req.headers['x-forwarded-for'] && ip === req.socket.remoteAddress && !warned.has(req.server)) {
    warned.add(req.server);
    req.log.warn(
      { peer: ip },
      'X-Forwarded-For arrived from a peer TRUST_PROXY does not trust — every web caller ' +
      'is being rate limited as one. Add this peer to TRUST_PROXY.',
    );
  }
  return ip;
}

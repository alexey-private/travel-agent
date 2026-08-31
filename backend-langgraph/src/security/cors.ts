import type { FastifyReply } from 'fastify';

/**
 * Which browser origins may read this backend's responses.
 *
 * CORS is the only thing standing between a page the user happens to have open
 * and this API, because a request needs nothing but a `userId` — a value the
 * page can read out of the user's own `localStorage` if it is same-origin, and
 * guess at otherwise. Reflecting whatever `Origin` arrives, which is what
 * `origin: true` does, means every page on the web passes that check.
 *
 * So the answer is an allowlist, never a reflection. `ALLOWED_ORIGIN` holds it,
 * comma-separated for a deploy that serves more than one front end, and a
 * production process that has none refuses to start (see `config/env.ts`) — the
 * failure this replaces was a deploy that silently allowed everything.
 *
 * A development machine gets `localhost` instead of a configured value, since
 * the frontend and the backend sit on different ports and are therefore already
 * cross-origin to each other. That default is unreachable in production, where
 * the variable is required.
 *
 * An origin that is not on the list is not rejected — it simply receives no
 * `Access-Control-Allow-Origin`, and the browser stops the page from reading the
 * response. Nothing outside a browser is affected, so the Telegram bridge, which
 * sends no `Origin` at all, is untouched.
 */
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function allowedOrigins(allowedOrigin: string | undefined, isProduction: boolean): (string | RegExp)[] {
  const configured = (allowedOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return isProduction ? [] : [DEV_ORIGIN];
}

/**
 * The CORS headers `@fastify/cors` already decided for this request.
 *
 * A route that calls `reply.hijack()` takes over the socket, so nothing ever
 * sends the headers the plugin set on the reply — they have to be copied into
 * the raw `writeHead` instead. Copying is the whole point: the SSE route used to
 * decide the origin a second time, by hand, and its answer was to reflect the
 * caller's own `Origin` when none was configured. One decision, made in one
 * place, cannot disagree with itself.
 *
 * `Access-Control-Allow-Credentials` is deliberately not among these. Nothing
 * here authenticates by cookie, and that header is exactly what would turn a
 * mistake in the allowlist into a way to read a signed-in user's stream.
 */
const HIJACKED_CORS_HEADERS = ['access-control-allow-origin', 'access-control-expose-headers', 'vary'];

export function hijackedCorsHeaders(reply: FastifyReply): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of HIJACKED_CORS_HEADERS) {
    const value = reply.getHeader(name);
    if (value === undefined) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

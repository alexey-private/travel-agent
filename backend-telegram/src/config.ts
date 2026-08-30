import 'dotenv/config';

/**
 * Runtime configuration, kept out of `index.ts` on purpose.
 *
 * `index.ts` builds and starts the bot as a side effect of being imported, so
 * anything importing it just to read a URL would boot the bot — and would fail
 * outright under Jest, where BOT_TOKEN is absent. Modules that only need the
 * backend address import it from here instead.
 */
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3002';

/**
 * Separate from BACKEND_URL: that one is a private-network address the bot's
 * own server-to-server fetch calls use, which is unreachable from a user's
 * browser (e.g. Railway's `*.railway.internal`). Links sent to the user
 * (like /connect's OAuth link) must use a publicly reachable URL instead.
 */
export const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL ?? BACKEND_URL;

/**
 * Shared with backend-langgraph. The backend will not answer for a `tg-` session
 * id without it, because such an id is derived from a public Telegram user id
 * and cannot protect anything on its own. Unset means every backend call this
 * bot makes comes back 403.
 */
export const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

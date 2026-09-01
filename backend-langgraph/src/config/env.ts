import dotenv from 'dotenv';
import path from 'path';

// Support running as an npm workspace (cwd = backend/) or from the project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
import { z } from 'zod';
import { DEFAULT_TRUST_PROXY } from '../security/trustProxy';

/**
 * Zod schema for environment variable validation.
 * All required variables must be present in the environment.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  TEST_DATABASE_URL: z
    .string()
    .url('TEST_DATABASE_URL must be a valid PostgreSQL connection string')
    .optional(),

  // AI
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // These two mean "the model the ACTIVE provider uses", which is all they have
  // ever meant. Resolution lives in src/llm/createModel.ts.
  REASONING_MODEL: z.string().optional(),
  FAST_MODEL: z.string().optional(),
  // Per-provider ids. A standby provider needs ids of its own: resolving them
  // against the active provider is how a fallback ends up asking OpenAI for
  // `claude-sonnet-4-6`. These win over the two generic keys above.
  ANTHROPIC_REASONING_MODEL: z.string().optional(),
  ANTHROPIC_FAST_MODEL: z.string().optional(),
  OPENAI_REASONING_MODEL: z.string().optional(),
  OPENAI_FAST_MODEL: z.string().optional(),

  // Automatic provider fallback. z.coerce.boolean() cannot express the kill
  // switch: Boolean('false') === true would make it impossible to turn off.
  LLM_FALLBACK_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // How long the standby is used before the primary is probed again. 0 retries
  // the primary on every request.
  LLM_FALLBACK_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(300_000),

  // External tools
  TAVILY_API_KEY: z.string().min(1, 'TAVILY_API_KEY is required'),
  OPENWEATHER_API_KEY: z.string().min(1, 'OPENWEATHER_API_KEY is required'),
  VOYAGE_API_KEY: z.string().optional(),
  DUFFEL_API_KEY: z.string().optional(),
  LITEAPI_KEY: z.string().optional(),

  // Google OAuth2
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // iCloud credentials encryption. Optional here and required in production by
  // the refinement below — a deploy without it used to fall back to a key
  // committed to this repository, which is no protection at all.
  ENCRYPTION_KEY: z.string().optional(),

  // Shared with backend-telegram. A Telegram session id is derived from a public
  // Telegram user id, so it cannot double as a bearer capability the way a web
  // UUID does — this secret is what makes that half of the namespace addressable
  // by the bridge alone. See src/security/internalAuth.ts.
  INTERNAL_API_SECRET: z.string().optional(),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),

  // Server
  PORT: z.coerce.number().int().positive().default(3002),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Which browser origins may read this API — one frontend URL
  // (e.g. https://app.example.com), or several separated by commas. Optional
  // here and required in production by the refinement below; omitted in
  // development, `localhost` on any port is allowed instead, since the frontend
  // sits on a different port and is already cross-origin. See src/security/cors.ts.
  ALLOWED_ORIGIN: z.string().optional(),
  // Which peers may speak for the caller through `X-Forwarded-For`, as a
  // comma-separated list of addresses, CIDR ranges, or the names proxy-addr
  // defines. `req.ip` is what the rate limiter counts a web caller by, so a
  // deploy whose edge proxy is missing here counts its entire user base as one
  // caller — see `security/trustProxy.ts`, which holds the default and logs
  // when that happens. Empty means no proxy is trusted, which is right when
  // clients reach this server directly.
  TRUST_PROXY: z.string().default(DEFAULT_TRUST_PROXY),
});

/**
 * Secrets that development may go without and production may not. Checked here
 * rather than at the point of use so the process refuses to start, instead of
 * silently running with a weaker key until someone connects an iCloud account.
 */
const MIN_ENCRYPTION_KEY_LENGTH = 32;

const envSchemaChecked = envSchema.superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== 'production') return;
  if (!cfg.ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ENCRYPTION_KEY'],
      message: 'ENCRYPTION_KEY is required in production — iCloud passwords are encrypted with it',
    });
  } else if (cfg.ENCRYPTION_KEY.length < MIN_ENCRYPTION_KEY_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ENCRYPTION_KEY'],
      message: `ENCRYPTION_KEY must be at least ${MIN_ENCRYPTION_KEY_LENGTH} characters`,
    });
  }
  if (!cfg.ALLOWED_ORIGIN?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ALLOWED_ORIGIN'],
      message:
        'ALLOWED_ORIGIN is required in production — without it there is no allowlist, and ' +
        'the only alternatives are refusing every browser or trusting all of them',
    });
  }
});

/**
 * Parsed and validated environment configuration.
 * Throws at startup if any required variable is missing or invalid.
 */
const parseResult = envSchemaChecked.safeParse(process.env);

if (!parseResult.success) {
  console.error('Invalid environment variables:');
  console.error(parseResult.error.flatten().fieldErrors);
  process.exit(1);
}

// Model ids are deliberately NOT defaulted here. They used to be, indexed by the
// active provider — which is why `env.REASONING_MODEL` held a Claude id whenever
// LLM_PROVIDER=anthropic, and why a standby reading it would have asked OpenAI
// for a Claude model. Defaulting now happens once, in `modelId()`
// (src/llm/createModel.ts), as a function of (provider, size). A second copy
// here would be a second answer to the same question, free to drift.
export const env = parseResult.data;

export type Env = typeof env;

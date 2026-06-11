import dotenv from 'dotenv';
import path from 'path';

// Support running as an npm workspace (cwd = backend/) or from the project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
import { z } from 'zod';

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
  REASONING_MODEL: z.string().optional(),
  FAST_MODEL: z.string().optional(),

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

  // iCloud credentials encryption
  ENCRYPTION_KEY: z.string().optional(),

  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Production CORS allowlist — set to the frontend URL (e.g. https://app.example.com).
  // Omit in development to allow any origin.
  ALLOWED_ORIGIN: z.string().optional(),
});

/**
 * Parsed and validated environment configuration.
 * Throws at startup if any required variable is missing or invalid.
 */
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('Invalid environment variables:');
  console.error(parseResult.error.flatten().fieldErrors);
  process.exit(1);
}

const MODEL_DEFAULTS = {
  anthropic: { REASONING_MODEL: 'claude-sonnet-4-6', FAST_MODEL: 'claude-haiku-4-5-20251001' },
  openai:    { REASONING_MODEL: 'gpt-4o',            FAST_MODEL: 'gpt-4o-mini' },
};

const _raw = parseResult.data;
const _defaults = MODEL_DEFAULTS[_raw.LLM_PROVIDER];

export const env = {
  ..._raw,
  REASONING_MODEL: _raw.REASONING_MODEL ?? _defaults.REASONING_MODEL,
  FAST_MODEL:      _raw.FAST_MODEL      ?? _defaults.FAST_MODEL,
};

export type Env = typeof env;

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  TEST_DATABASE_URL: z
    .string()
    .url('TEST_DATABASE_URL must be a valid PostgreSQL connection string')
    .optional(),

  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  REASONING_MODEL: z.string().optional(),
  FAST_MODEL: z.string().optional(),

  TAVILY_API_KEY: z.string().min(1, 'TAVILY_API_KEY is required'),
  OPENWEATHER_API_KEY: z.string().min(1, 'OPENWEATHER_API_KEY is required'),
  VOYAGE_API_KEY: z.string().optional(),

  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

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

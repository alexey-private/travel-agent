import 'dotenv/config';
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
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  // External tools
  TAVILY_API_KEY: z.string().min(1, 'TAVILY_API_KEY is required'),
  OPENWEATHER_API_KEY: z.string().min(1, 'OPENWEATHER_API_KEY is required'),

  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
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

export const env = parseResult.data;

export type Env = typeof env;

/**
 * `ENCRYPTION_KEY` used to have a fallback committed to this repository, so a
 * production deploy that forgot the variable encrypted every iCloud password
 * under a key anyone could read. The variable is now required in production,
 * and this is what proves the process refuses to start without it.
 *
 * dotenv is stubbed out: the real one would read whatever `.env` happens to sit
 * next to the checkout and quietly supply the variable the test removed.
 */

jest.mock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));

import { DEFAULT_TRUST_PROXY } from '@/security/trustProxy';

const VALID = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
  TAVILY_API_KEY: 'tvly-test',
  OPENWEATHER_API_KEY: 'owm-test',
};

interface LoadResult {
  exited: boolean;
  errors: string;
}

function load(overrides: Record<string, string | undefined>): LoadResult {
  const saved = process.env;
  process.env = { ...VALID, ...overrides } as NodeJS.ProcessEnv;

  let exited = false;
  const errors: unknown[] = [];
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((): never => {
    exited = true;
    throw new Error('process.exit');
  }) as never);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(...args);
  });

  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/config/env');
    });
  } catch (err) {
    if (!exited) throw err;
  } finally {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    process.env = saved;
  }

  return { exited, errors: JSON.stringify(errors) };
}

/** Loads the module and hands back the parsed config it exports. */
function loadEnv(overrides: Record<string, string | undefined> = {}): Record<string, unknown> {
  const saved = process.env;
  process.env = { ...VALID, ...overrides } as NodeJS.ProcessEnv;
  let parsed: Record<string, unknown> = {};
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      parsed = require('@/config/env').env;
    });
  } finally {
    process.env = saved;
  }
  return parsed;
}

describe('TRUST_PROXY', () => {
  it('has a default, and it is the one the security module defines', () => {
    // A deploy that never sets this must still trust its edge proxy: without a
    // default, `req.ip` is the proxy for everyone and the rate limit counts the
    // whole user base as one caller. Which ranges those are, and why, belongs to
    // `security/trustProxy.ts` — this only proves the schema takes them from it.
    expect(loadEnv().TRUST_PROXY).toBe(DEFAULT_TRUST_PROXY);
  });

  it('can be turned off for a server clients reach directly', () => {
    expect(loadEnv({ TRUST_PROXY: '' }).TRUST_PROXY).toBe('');
  });
});

/** A production environment with everything production insists on. */
const PROD = {
  NODE_ENV: 'production',
  ENCRYPTION_KEY: 'a-32-character-key-for-tests-012',
  ALLOWED_ORIGIN: 'https://app.example.com',
};

describe('ENCRYPTION_KEY', () => {
  it('is required in production', () => {
    const { exited, errors } = load({ ...PROD, ENCRYPTION_KEY: undefined });
    expect(exited).toBe(true);
    expect(errors).toContain('ENCRYPTION_KEY');
  });

  it('must be long enough to be worth deriving from', () => {
    const { exited, errors } = load({ ...PROD, ENCRYPTION_KEY: 'too-short' });
    expect(exited).toBe(true);
    expect(errors).toContain('ENCRYPTION_KEY');
  });

  it('is accepted in production when set', () => {
    const { exited } = load(PROD);
    expect(exited).toBe(false);
  });

  it('stays optional outside production, so `npm run dev` needs no secret', () => {
    const { exited } = load({ NODE_ENV: 'development', ENCRYPTION_KEY: undefined });
    expect(exited).toBe(false);
  });
});

describe('ALLOWED_ORIGIN', () => {
  it('is required in production', () => {
    // Nothing but the origin check stands between a page the user has open and
    // this API, so a production deploy without a list has no safe reading: it
    // either refuses every browser or trusts them all. Refusing to boot says so.
    const { exited, errors } = load({ ...PROD, ALLOWED_ORIGIN: undefined });
    expect(exited).toBe(true);
    expect(errors).toContain('ALLOWED_ORIGIN');
  });

  it('is not satisfied by a blank value', () => {
    const { exited, errors } = load({ ...PROD, ALLOWED_ORIGIN: '   ' });
    expect(exited).toBe(true);
    expect(errors).toContain('ALLOWED_ORIGIN');
  });

  it('stays optional outside production, where localhost is allowed instead', () => {
    const { exited } = load({ NODE_ENV: 'development', ALLOWED_ORIGIN: undefined });
    expect(exited).toBe(false);
  });
});

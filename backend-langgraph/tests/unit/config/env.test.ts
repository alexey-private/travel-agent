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

describe('ENCRYPTION_KEY', () => {
  it('is required in production', () => {
    const { exited, errors } = load({ NODE_ENV: 'production', ENCRYPTION_KEY: undefined });
    expect(exited).toBe(true);
    expect(errors).toContain('ENCRYPTION_KEY');
  });

  it('must be long enough to be worth deriving from', () => {
    const { exited, errors } = load({ NODE_ENV: 'production', ENCRYPTION_KEY: 'too-short' });
    expect(exited).toBe(true);
    expect(errors).toContain('ENCRYPTION_KEY');
  });

  it('is accepted in production when set', () => {
    const { exited } = load({
      NODE_ENV: 'production',
      ENCRYPTION_KEY: 'a-32-character-key-for-tests-012',
    });
    expect(exited).toBe(false);
  });

  it('stays optional outside production, so `npm run dev` needs no secret', () => {
    const { exited } = load({ NODE_ENV: 'development', ENCRYPTION_KEY: undefined });
    expect(exited).toBe(false);
  });
});

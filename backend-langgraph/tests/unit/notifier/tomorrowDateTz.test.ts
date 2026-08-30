import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * What "tomorrow" is on a server that is not in UTC.
 *
 * Every case below is a real deployment: the run fires at the default 09:00
 * local, and the question is only which day the notifier then looks for. The
 * old implementation counted the day locally and rendered it in UTC, so the two
 * halves disagreed by exactly the offset — Auckland and Adelaide were told about
 * the day they were already having, and a late run in California about the day
 * after next.
 *
 * The timezone has to come from the environment of a child process; see
 * `tests/helpers/printTomorrow.ts` for why it cannot be set inside a test.
 */
const CASES = [
  // 09:00 local, the default run hour.
  { tz: 'Pacific/Auckland',     at: '2026-08-29T21:00:00Z', expect: '2026-08-31' },
  // UTC+9:30. The threshold is nine hours ahead of UTC, not ten — a whole
  // timezone sits between the two, and it was on the broken side.
  { tz: 'Australia/Adelaide',   at: '2026-08-29T23:30:00Z', expect: '2026-08-31' },
  { tz: 'Asia/Jerusalem',       at: '2026-08-30T06:00:00Z', expect: '2026-08-31' },
  { tz: 'America/Los_Angeles',  at: '2026-08-30T16:00:00Z', expect: '2026-08-31' },
  { tz: 'UTC',                  at: '2026-08-30T09:00:00Z', expect: '2026-08-31' },
  // A run late in the evening, west of UTC: the instant is already tomorrow in UTC.
  { tz: 'America/Los_Angeles',  at: '2026-08-31T05:00:00Z', expect: '2026-08-31' },
  // Across a month boundary, and across the end of a 31-day month.
  { tz: 'Pacific/Auckland',     at: '2026-08-30T21:00:00Z', expect: '2026-09-01' },
];

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'tests/helpers/printTomorrow.ts');
const TSX = require.resolve('tsx/cli');

function tomorrowIn(tz: string, at: string): string {
  const result = spawnSync(process.execPath, [TSX, SCRIPT, at], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TZ: tz },
  });

  if (result.status !== 0) {
    throw new Error(`printTomorrow failed under TZ=${tz}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

describe('tomorrowDate — timezones', () => {
  // Each case is a child process compiling TypeScript on the way in.
  it.each(CASES)('is $expect at $at in $tz', ({ tz, at, expect: expected }) => {
    expect(tomorrowIn(tz, at)).toBe(expected);
  }, 30_000);
});

/**
 * Prints `tomorrowDate()` for one instant, in whatever timezone the process was
 * given.
 *
 * It exists as a script because the timezone cannot be changed from inside a
 * test: jest hands each test file a copied `process`, so assigning to
 * `process.env.TZ` never reaches the setter that tells V8 to forget the zone it
 * cached. A child process started with `TZ=` in its environment is the only way
 * to see the function behave as it would on a server elsewhere.
 *
 * Usage: tsx tests/helpers/printTomorrow.ts <iso instant>
 */
import { tomorrowDate } from '../../src/notifier/web-push.cron';

const instant = process.argv[2];
if (!instant) {
  throw new Error('usage: printTomorrow.ts <iso instant>');
}

process.stdout.write(tomorrowDate(new Date(instant)));

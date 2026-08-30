import { notificationTitle, notificationOverflow, formatEventTime } from '@/i18n/notifications';
import { countIntl } from '../../helpers/countIntl';

describe('push notification copy', () => {
  it('titles the notification in each language', () => {
    expect(notificationTitle('en')).toMatch(/tomorrow/i);
    expect(notificationTitle('he')).toMatch(/[֐-׿]/);
    expect(notificationTitle('ru')).toMatch(/[Ѐ-ӿ]/);
  });

  it('pluralises the overflow line in Russian', () => {
    expect(notificationOverflow('ru', 1)).toMatch(/ещё 1 /);
    expect(notificationOverflow('ru', 3)).not.toBe(notificationOverflow('ru', 5));
  });

  it('pluralises the overflow line in English', () => {
    expect(notificationOverflow('en', 1)).toContain('1 more');
    expect(notificationOverflow('en', 4)).toContain('4 more');
  });

  it('writes the overflow line in Hebrew', () => {
    expect(notificationOverflow('he', 2)).toMatch(/[֐-׿]/);
    expect(notificationOverflow('he', 2)).toContain('2');
  });

  it('formats a time string on a 24-hour clock in every locale', () => {
    // Pinned exactly. English is a 12-hour locale by default, so without
    // hourCycle:'h23' this renders "02:30 PM" — an assertion loose enough to
    // accept either could not tell the two apart.
    expect(formatEventTime('en', '14:30')).toBe('14:30');
    expect(formatEventTime('he', '14:30')).toBe('14:30');
    expect(formatEventTime('ru', '14:30')).toBe('14:30');
  });

  it('zero-pads a single-digit hour', () => {
    expect(formatEventTime('en', '9:05')).toBe('09:05');
  });

  it('returns the time untouched when it cannot be parsed', () => {
    expect(formatEventTime('en', 'all day')).toBe('all day');
  });
});

describe('push notification formatter reuse', () => {
  it('builds one time formatter per locale at import, not one per event', async () => {
    jest.resetModules();
    const counter = countIntl('DateTimeFormat');

    try {
      const { formatEventTime: fresh } = await import('@/i18n/notifications');
      expect(counter.count()).toBe(3);

      // The daily cron formats a time for every event of every subscriber in
      // one pass — that pass must not build a single formatter more.
      for (let i = 0; i < 10; i += 1) {
        fresh('ru', '14:30');
        fresh('en', '09:05');
        fresh('he', '23:59');
      }
      expect(counter.count()).toBe(3);
    } finally {
      counter.restore();
    }
  });

  it('builds the Russian plural rules once, not once per overflow line', async () => {
    jest.resetModules();
    const counter = countIntl('PluralRules');

    try {
      const { notificationOverflow: fresh } = await import('@/i18n/notifications');
      expect(counter.count()).toBe(1);

      for (let i = 0; i < 10; i += 1) fresh('ru', i);
      expect(counter.count()).toBe(1);
    } finally {
      counter.restore();
    }
  });
});

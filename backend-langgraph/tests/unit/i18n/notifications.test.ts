import { notificationTitle, notificationOverflow, formatEventTime } from '@/i18n/notifications';

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

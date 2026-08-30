import { LOCALES, DEFAULT_LOCALE, isLocale, LOCALE_LABELS } from '../src/i18n/config';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { t } from '../src/i18n/t';

describe('bot i18n', () => {
  it('supports exactly the three locales the backend supports', () => {
    expect(LOCALES).toEqual(['en', 'he', 'ru']);
    expect(DEFAULT_LOCALE).toBe('en');
    expect(isLocale('he')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });

  it('labels each locale in its own script', () => {
    expect(LOCALE_LABELS).toEqual({ en: 'EN', he: 'עברית', ru: 'RU' });
  });

  it('has the same key set in every locale', () => {
    const reference = Object.keys(DICTIONARIES.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort()).toEqual(reference);
    }
  });

  it('resolves a key in the requested locale', () => {
    expect(t('en', 'common.thinking')).toMatch(/\w/);
    expect(t('he', 'common.thinking')).toMatch(/[֐-׿]/);
    expect(t('ru', 'common.thinking')).toMatch(/[Ѐ-ӿ]/);
  });

  it('interpolates variables', () => {
    expect(t('en', 'mode.current', { mode: 'travel' })).toContain('travel');
  });

  it('falls back to the key when it is unknown', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(t('en', 'nope.missing' as any)).toBe('nope.missing');
  });
});

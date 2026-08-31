import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  dirOf,
  LOCALE_LABELS,
  LANGUAGE_NAMES,
} from '../src/locale';

describe('locale', () => {
  it('supports exactly the three locales the database CHECK constraint allows', () => {
    expect(LOCALES).toEqual(['en', 'he', 'ru']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('accepts a supported locale and rejects anything else', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('he')).toBe(true);
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(1)).toBe(false);
  });

  it('reports Hebrew as right-to-left and the rest as left-to-right', () => {
    expect(dirOf('he')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(dirOf('ru')).toBe('ltr');
  });

  it('labels each locale in its own script', () => {
    expect(LOCALE_LABELS).toEqual({ en: 'EN', he: 'עברית', ru: 'RU' });
  });

  it('names each locale in English for the system prompt', () => {
    expect(LANGUAGE_NAMES).toEqual({ en: 'English', he: 'Hebrew', ru: 'Russian' });
  });

  it('has a label and a name for every supported locale', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(LANGUAGE_NAMES[locale]).toBeTruthy();
    }
  });
});

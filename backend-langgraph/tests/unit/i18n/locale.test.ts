import { LOCALES, DEFAULT_LOCALE, isLocale, dirOf, LANGUAGE_NAMES, Locale } from '@/i18n/locale';

describe('locale', () => {
  it('exposes exactly the three supported locales', () => {
    expect(LOCALES).toEqual(['en', 'he', 'ru']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('accepts supported locale strings', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('he')).toBe(true);
    expect(isLocale('ru')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('marks Hebrew as right-to-left and the rest as left-to-right', () => {
    expect(dirOf('he')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(dirOf('ru')).toBe('ltr');
  });

  it('names every locale in English for use inside prompts', () => {
    const names: Record<Locale, string> = LANGUAGE_NAMES;
    expect(names).toEqual({ en: 'English', he: 'Hebrew', ru: 'Russian' });
  });
});

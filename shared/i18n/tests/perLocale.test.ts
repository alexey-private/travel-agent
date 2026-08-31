import { perLocale } from '../src/perLocale';
import { LOCALES } from '../src/locale';

describe('perLocale', () => {
  it('builds nothing until something asks for a locale', () => {
    const build = jest.fn((locale: string) => ({ locale }));

    perLocale(build);

    expect(build).not.toHaveBeenCalled();
  });

  it('builds once per locale and hands back the same object after that', () => {
    const built: string[] = [];
    const get = perLocale((locale) => {
      built.push(locale);
      return { locale };
    });

    const first = get('ru');

    expect(get('ru')).toBe(first);
    expect(get('ru')).toBe(first);
    expect(built).toEqual(['ru']);
  });

  it('keeps the locales apart', () => {
    const get = perLocale((locale) => ({ locale }));

    for (const locale of LOCALES) {
      expect(get(locale).locale).toBe(locale);
    }
    expect(get('en')).not.toBe(get('he'));
  });
});

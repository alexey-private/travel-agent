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

  it('escapes markup in an interpolated value', () => {
    // A city, an error message or a tool name is not ours to trust, and the
    // result goes to Telegram as HTML: an unescaped `&` is a 400, not a typo.
    expect(t('en', 'mode.current', { mode: 'R&D <team>' }))
      .toContain('R&amp;D &lt;team&gt;');
  });

  it('leaves the markup written into the template alone', () => {
    // `mode.current` wraps its value in <b>…</b>; escaping the value must not
    // escape the wrapper, or the user reads the tags instead of bold text.
    expect(t('en', 'mode.current', { mode: 'travel' })).toContain('<b>travel</b>');
  });

  it('escapes the query separators of the signed /connect link', () => {
    // The link carries `&platform=`, `&exp=` and `&sig=` and is placed inside
    // <code>…</code>. Escaping is what makes it valid HTML — Telegram decodes
    // the entity back, so the person still copies a working URL — and the
    // signature it carries is what stops the OAuth flow being retargeted.
    const url = 'https://app.example/auth/google/start?userId=tg-42&platform=telegram&exp=1&sig=ab';
    const rendered = t('en', 'connect.link', { url });

    expect(rendered).toContain('&amp;platform=telegram&amp;exp=1&amp;sig=ab');
    expect(rendered).toContain('<code>');
  });

  it('falls back to the key when it is unknown', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(t('en', 'nope.missing' as any)).toBe('nope.missing');
  });
});

/**
 * `t()` escapes the values it interpolates, which only holds the whole message
 * together if the templates around them are themselves valid Telegram HTML.
 * The one population that is not is `commands.*`: those go to `setMyCommands`
 * as plain text, take no variables, and may say "Calendar & Tasks" literally.
 */
describe('dictionary values are valid Telegram HTML', () => {
  const ALLOWED_TAG = /<\/?(b|i|u|s|code|pre|a)(\s[^<>]*)?>/g;
  const ENTITY = /&(?!amp;|lt;|gt;|quot;|#\d+;)/;

  function flatten(entry: unknown): string[] {
    if (typeof entry === 'string') return [entry];
    if (typeof entry === 'object' && entry !== null) return Object.values(entry) as string[];
    return [];
  }

  it.each(LOCALES)('%s leaves no bare & or stray angle bracket', (locale) => {
    for (const [key, entry] of Object.entries(DICTIONARIES[locale])) {
      if (key.startsWith('commands.')) continue;
      for (const value of flatten(entry)) {
        const text = value.replace(ALLOWED_TAG, '');
        expect({ key, text }).toEqual({ key, text: expect.not.stringMatching(ENTITY) });
        expect({ key, text }).toEqual({ key, text: expect.not.stringMatching(/[<>]/) });
      }
    }
  });
});

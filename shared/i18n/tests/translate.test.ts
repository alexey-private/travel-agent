import { translate } from '../src/translate';
import { countIntl } from './helpers/countIntl';
import type { PluralForms } from '../src/types';

const dict = {
  'chat.send': 'Send',
  'chat.attached': '{count} file attached',
  'memory.itemsCount': { one: '{count} item', other: '{count} items' } as PluralForms,
  'memory.itemsCountRu': {
    one: '{count} запись',
    few: '{count} записи',
    many: '{count} записей',
    other: '{count} записи',
  } as PluralForms,
};

const key = (k: string) => k as keyof typeof dict;

describe('translate', () => {
  it('returns a plain string as-is', () => {
    expect(translate(dict, 'en', 'chat.send')).toBe('Send');
  });

  it('interpolates named variables', () => {
    expect(translate(dict, 'en', 'chat.attached', { count: 3 })).toBe('3 file attached');
  });

  it('leaves an unknown placeholder untouched', () => {
    expect(translate(dict, 'en', 'chat.attached')).toBe('{count} file attached');
    expect(translate(dict, 'en', 'chat.attached', { other: 'x' })).toBe('{count} file attached');
  });

  it('selects the English singular and plural', () => {
    expect(translate(dict, 'en', 'memory.itemsCount', { count: 1 })).toBe('1 item');
    expect(translate(dict, 'en', 'memory.itemsCount', { count: 5 })).toBe('5 items');
  });

  it('selects Russian few and many forms', () => {
    expect(translate(dict, 'ru', 'memory.itemsCountRu', { count: 1 })).toBe('1 запись');
    expect(translate(dict, 'ru', 'memory.itemsCountRu', { count: 3 })).toBe('3 записи');
    expect(translate(dict, 'ru', 'memory.itemsCountRu', { count: 7 })).toBe('7 записей');
  });

  it('falls back to `other` when a locale asks for a form the entry lacks', () => {
    expect(translate(dict, 'ru', 'memory.itemsCount', { count: 3 })).toBe('3 items');
  });

  it('treats a missing count as zero', () => {
    expect(translate(dict, 'en', 'memory.itemsCount')).toBe('{count} items');
  });

  it('returns the key itself when it is missing from the dictionary', () => {
    expect(translate(dict, 'en', key('nope.missing'))).toBe('nope.missing');
  });
});

describe('translate escaping', () => {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  it('escapes an interpolated value when the caller asks it to', () => {
    expect(translate(dict, 'en', 'chat.attached', { count: '<b>' }, escape)).toBe(
      '&lt;b> file attached',
    );
  });

  it('leaves the template alone', () => {
    const markup = { 'chat.bold': '<b>{count}</b>' };
    expect(translate(markup, 'en', 'chat.bold', { count: 'a&b' }, escape)).toBe('<b>a&amp;b</b>');
  });

  it('does not escape when no escaper is passed', () => {
    expect(translate(dict, 'en', 'chat.attached', { count: 'a&b' })).toBe('a&b file attached');
  });
});

describe('translate plural rules reuse', () => {
  it('builds one PluralRules per locale, not one per string', async () => {
    jest.resetModules();
    const counter = countIntl('PluralRules');

    try {
      const { translate: fresh } = await import('../src/translate');

      // Every string on a screen comes through here; a list of counted items
      // would otherwise build a rules object per row.
      for (let i = 0; i < 10; i += 1) {
        fresh(dict, 'ru', 'memory.itemsCountRu', { count: i });
      }
      expect(counter.count()).toBe(1);

      fresh(dict, 'en', 'memory.itemsCount', { count: 2 });
      expect(counter.count()).toBe(2);
    } finally {
      counter.restore();
    }
  });
});

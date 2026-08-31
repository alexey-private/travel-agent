import {
  scriptRe,
  containsRtl,
  RTL_RANGE,
  HEBREW_RANGE,
  CYRILLIC_RANGE,
  LATIN_RANGE,
} from '../src/scripts';

describe('script ranges', () => {
  it('separates the three alphabets the app serves', () => {
    const hebrew = scriptRe(HEBREW_RANGE);
    const cyrillic = scriptRe(CYRILLIC_RANGE);
    const latin = scriptRe(LATIN_RANGE);

    expect(hebrew.test('ש')).toBe(true);
    expect(hebrew.test('д')).toBe(false);
    expect(hebrew.test('a')).toBe(false);

    expect(cyrillic.test('д')).toBe(true);
    expect(cyrillic.test('ש')).toBe(false);

    expect(latin.test('a')).toBe(true);
    expect(latin.test('д')).toBe(false);
  });

  it('counts every letter when the matcher is global', () => {
    expect('שלום'.match(scriptRe(HEBREW_RANGE, 'g'))).toHaveLength(4);
  });

  it('hands back a new regex each call, so no caller inherits another lastIndex', () => {
    const a = scriptRe(HEBREW_RANGE, 'g');
    const b = scriptRe(HEBREW_RANGE, 'g');
    a.test('שלום');

    expect(a.lastIndex).toBeGreaterThan(0);
    expect(b.lastIndex).toBe(0);
  });
});

describe('containsRtl', () => {
  it('is true for Hebrew, Arabic and their presentation forms', () => {
    expect(containsRtl('שלום')).toBe(true);
    expect(containsRtl('مرحبا')).toBe(true);
    // Hebrew and Arabic presentation forms: U+FB2A and U+FE8D.
    expect(containsRtl('שּׁ')).toBe(true);
    expect(containsRtl('ﺍ')).toBe(true);
  });

  it('is false for the left-to-right scripts', () => {
    expect(containsRtl('Rome, 397 €')).toBe(false);
    expect(containsRtl('Найдено 3 рейса')).toBe(false);
    expect(containsRtl('')).toBe(false);
  });

  it('is true for one right-to-left letter in an otherwise Latin line', () => {
    expect(containsRtl('El Al — אל על')).toBe(true);
  });

  it('covers the Arabic presentation forms the PDF emoji strip must not eat', () => {
    // The two modules disagreed here: one called U+FE70–U+FEFC right-to-left
    // text, the other deleted it as a variation selector.
    expect(scriptRe(RTL_RANGE).test('ﹰ')).toBe(true);
    expect(scriptRe(RTL_RANGE).test('ﻼ')).toBe(true);
  });
});

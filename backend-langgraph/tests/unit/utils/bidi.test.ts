import { containsRtl, toVisual, baseDirFor, wrapToWidth } from '@/utils/bidi';

describe('containsRtl', () => {
  it('finds Hebrew', () => {
    expect(containsRtl('שלום')).toBe(true);
  });

  it('finds Hebrew mixed into Latin text', () => {
    expect(containsRtl('Flight to תל אביב')).toBe(true);
  });

  it('says no for Latin and Cyrillic', () => {
    expect(containsRtl('Hello world')).toBe(false);
    expect(containsRtl('Привет мир')).toBe(false);
    expect(containsRtl('')).toBe(false);
  });
});

describe('toVisual', () => {
  it('leaves pure left-to-right text untouched', () => {
    const text = 'Flight IB3167 · EWR→NRT · €397';
    expect(toVisual(text, 'ltr')).toBe(text);
  });

  it('leaves Cyrillic untouched', () => {
    const text = 'Рейс из Тель-Авива в Рим, 397 евро';
    expect(toVisual(text, 'ltr')).toBe(text);
  });

  it('reverses a pure Hebrew run', () => {
    expect(toVisual('שלום', 'rtl')).toBe('םולש');
  });

  it('keeps a number readable inside Hebrew text', () => {
    const visual = toVisual('נמצאו 397 טיסות', 'rtl');
    expect(visual).toContain('397');
    expect(visual).not.toContain('793');
  });

  it('keeps a Latin identifier readable inside Hebrew text', () => {
    const visual = toVisual('טיסה IB3167 לרומא', 'rtl');
    expect(visual).toContain('IB3167');
  });

  it('mirrors brackets in a right-to-left run', () => {
    const visual = toVisual('(שלום)', 'rtl');
    expect(visual.startsWith('(')).toBe(true);
    expect(visual.endsWith(')')).toBe(true);
  });

  it('is reversible: applying it to its own output restores the input', () => {
    const original = 'נמצאו 397 טיסות';
    expect(toVisual(toVisual(original, 'rtl'), 'rtl')).toBe(original);
  });

  it('handles an empty string', () => {
    expect(toVisual('', 'rtl')).toBe('');
  });

  it('preserves string length', () => {
    const original = 'טיסה IB3167 ל-תל אביב ב-397 ש"ח';
    expect(toVisual(original, 'rtl')).toHaveLength(original.length);
  });

  /**
   * The list marker is written logically, at the head of the string. The algorithm
   * is what moves it to the right edge — where a Hebrew reader starts the line —
   * so nothing in the renderer needs to reposition it by hand.
   */
  it('moves a list marker to the end of the visual string', () => {
    expect(toVisual('• לבדוק דרכון', 'rtl').endsWith('•')).toBe(true);
  });
});

describe('baseDirFor', () => {
  it('trusts an explicit Hebrew locale', () => {
    expect(baseDirFor('he', 'Hello')).toBe('rtl');
  });

  it('trusts an explicit left-to-right locale', () => {
    expect(baseDirFor('ru', 'שלום')).toBe('ltr');
  });

  it('falls back to sniffing the content when no locale is given', () => {
    expect(baseDirFor(undefined, 'שלום')).toBe('rtl');
    expect(baseDirFor(undefined, 'Hello')).toBe('ltr');
  });
});

/** Pretend every character is 10 units wide. */
const measure = (s: string) => s.length * 10;

describe('wrapToWidth', () => {
  it('leaves a short line alone', () => {
    expect(wrapToWidth('one two', 1000, measure)).toEqual(['one two']);
  });

  it('breaks on spaces', () => {
    expect(wrapToWidth('aaa bbb ccc', 70, measure)).toEqual(['aaa bbb', 'ccc']);
  });

  it('puts an over-long word on its own line rather than dropping it', () => {
    expect(wrapToWidth('aa bbbbbbbbbb cc', 40, measure)).toEqual(['aa', 'bbbbbbbbbb', 'cc']);
  });

  it('handles an empty string', () => {
    expect(wrapToWidth('', 100, measure)).toEqual(['']);
  });

  it('collapses no whitespace it was not asked to', () => {
    expect(wrapToWidth('aaa  bbb', 1000, measure)).toEqual(['aaa  bbb']);
  });

  /** The same, but through the wrapping path rather than the short-line fast path. */
  it('keeps a double space intact across a break', () => {
    expect(wrapToWidth('aaa  bbb ccc', 80, measure)).toEqual(['aaa  bbb', 'ccc']);
  });

  /**
   * The plan wrote this case at width 70, which no arrangement of these words can
   * satisfy: 'שלום עולם' is nine characters, so it measures 90.
   */
  it('wraps Hebrew the same way — it is still space-separated', () => {
    expect(wrapToWidth('שלום עולם יפה', 90, measure)).toEqual(['שלום עולם', 'יפה']);
  });

  it('never drops content, whatever the width', () => {
    const text = 'טיסה IB3167 לרומא ב-397 אירו';
    expect(wrapToWidth(text, 50, measure).join(' ')).toBe(text);
  });
});

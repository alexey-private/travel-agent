import { detectReplyLocale } from '@/i18n/detectReplyLocale';

describe('detectReplyLocale', () => {
  it('reads a Hebrew reply as Hebrew', () => {
    expect(detectReplyLocale('## 🧳 מה לארוז לאיסלנד בחורף', 'en')).toBe('he');
  });

  it('reads a Russian reply as Russian', () => {
    expect(detectReplyLocale('## Что взять в Исландию зимой', 'en')).toBe('ru');
  });

  it('reads an English reply as English', () => {
    expect(detectReplyLocale('## Iceland Winter Packing List', 'he')).toBe('en');
  });

  /**
   * The reason this exists: an agent answering in English because the user wrote in
   * English must not get Hebrew follow-ups underneath, and the setting alone cannot
   * tell us that happened.
   */
  it('follows the reply, not the fallback, when the two disagree', () => {
    expect(detectReplyLocale('Here are three options for your trip.', 'he')).toBe('en');
  });

  it('ignores Latin identifiers embedded in a Hebrew reply', () => {
    expect(detectReplyLocale('טיסה TLV → KEF עם EL AL, מחיר 450 USD, פרטים נוספים בהמשך', 'en')).toBe('he');
  });

  it('falls back when the text carries no letters at all', () => {
    expect(detectReplyLocale('450 → 900 (12:30)', 'he')).toBe('he');
    expect(detectReplyLocale('', 'ru')).toBe('ru');
  });
});

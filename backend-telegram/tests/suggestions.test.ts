import { STARTER_POOLS } from '../src/data/suggestions';
import { LOCALES } from '@travel-agent/i18n';

describe('starter pools', () => {
  it('covers every locale and both agents with ten entries each', () => {
    for (const locale of LOCALES) {
      expect(STARTER_POOLS[locale].travel).toHaveLength(10);
      expect(STARTER_POOLS[locale].shopping).toHaveLength(10);
    }
  });

  it('writes Hebrew entries in Hebrew', () => {
    for (const s of STARTER_POOLS.he.travel) expect(s).toMatch(/[֐-׿]/);
  });

  it('writes Russian entries in Cyrillic', () => {
    for (const s of STARTER_POOLS.ru.travel) expect(s).toMatch(/[Ѐ-ӿ]/);
  });

  it('keeps every entry short enough for an inline keyboard button', () => {
    for (const locale of LOCALES) {
      for (const agent of ['travel', 'shopping'] as const) {
        for (const s of STARTER_POOLS[locale][agent]) {
          expect(Buffer.byteLength(s, 'utf8')).toBeLessThanOrEqual(64);
        }
      }
    }
  });
});

import Fastify, { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import { exportRoutes } from '@/routes/export';

const HEBREW_MARKDOWN = `# תוכנית הטיול שלי

נמצאו 3 טיסות מתל אביב לרומא ב-397 אירו.

| חברה | מחיר | משך |
|------|------|-----|
| El Al | €397 | 3h 40m |
| Wizz  | €215 | 3h 55m |

- לבדוק דרכון
- להזמין מלון
`;

const ENGLISH_MARKDOWN = `# My trip

Found 3 flights from Tel Aviv to Rome for €397.

| Airline | Price | Duration |
|---------|-------|----------|
| El Al   | €397  | 3h 40m   |

- check passport
- book a hotel
`;

/**
 * What actually reached the page.
 *
 * Asserting that the response is a PDF proves nothing about direction — a PDF
 * with the Hebrew backwards is still a valid PDF. So the tests watch the calls
 * pdfkit received instead.
 */
type TextCall = { text: string; opts: Record<string, unknown> };

function textCalls(spy: jest.SpyInstance): TextCall[] {
  return spy.mock.calls.map((args) => {
    const text = String(args[0]);
    // pdfkit's signature is text(str, opts) or text(str, x, y, opts).
    const opts = (typeof args[1] === 'object' && args[1] !== null ? args[1] : args[3]) ?? {};
    return { text, opts: opts as Record<string, unknown> };
  });
}

describe('PDF export — right-to-left', () => {
  let app: FastifyInstance;
  let textSpy: jest.SpyInstance;

  beforeEach(async () => {
    textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    app = Fastify();
    await app.register(exportRoutes, {});
    await app.ready();
  });

  afterEach(async () => {
    textSpy.mockRestore();
    await app.close();
  });

  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/export/pdf', payload });

  it('produces a valid PDF for Hebrew markdown', async () => {
    const res = await post({ text: HEBREW_MARKDOWN, language: 'he' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.rawPayload.length).toBeGreaterThan(1000);
  });

  it('reverses the Hebrew heading into visual order', async () => {
    await post({ text: HEBREW_MARKDOWN, language: 'he' });
    const heading = textCalls(textSpy).find((c) => c.text.includes('תוכנית'.split('').reverse().join('')));
    expect(heading).toBeDefined();
    expect(heading?.opts.align).toBe('right');
  });

  it('leaves numbers and Latin identifiers readable inside Hebrew', async () => {
    await post({ text: HEBREW_MARKDOWN, language: 'he' });
    const all = textCalls(textSpy).map((c) => c.text).join('\n');
    expect(all).toContain('397');
    expect(all).not.toContain('793');
    expect(all).toContain('El Al');
  });

  it('right-aligns every piece of Hebrew flow text', async () => {
    await post({ text: HEBREW_MARKDOWN, language: 'he' });
    const hebrewCalls = textCalls(textSpy).filter((c) => /[֐-׿]/.test(c.text));
    expect(hebrewCalls.length).toBeGreaterThan(0);
    for (const call of hebrewCalls) {
      expect(call.opts.align).toBe('right');
    }
  });

  it('detects Hebrew when no language is given', async () => {
    const res = await post({ text: HEBREW_MARKDOWN });
    expect(res.statusCode).toBe(200);
    const hebrewCalls = textCalls(textSpy).filter((c) => /[֐-׿]/.test(c.text));
    expect(hebrewCalls.length).toBeGreaterThan(0);
    expect(hebrewCalls.every((c) => c.opts.align === 'right')).toBe(true);
  });

  it('mirrors the table column order', async () => {
    await post({ text: HEBREW_MARKDOWN, language: 'he' });
    const header = textCalls(textSpy).filter((c) => /^(חברה|מחיר|משך)$/.test(c.text.split('').reverse().join('')));
    expect(header).toHaveLength(3);
    const xs = textSpy.mock.calls
      .filter((args) => typeof args[1] === 'number' && /[֐-׿]/.test(String(args[0])))
      .map((args) => args[1] as number);
    // The first markdown column is drawn rightmost, so x decreases across the row.
    expect(xs[0]).toBeGreaterThan(xs[1]);
    expect(xs[1]).toBeGreaterThan(xs[2]);
  });

  it('survives a Hebrew paragraph long enough to wrap', async () => {
    const long = 'נמצאו טיסות רבות מתל אביב לרומא '.repeat(20);
    const res = await post({ text: long, language: 'he' });
    expect(res.statusCode).toBe(200);
    const wrapped = textCalls(textSpy).find((c) => c.text.includes('\n'));
    expect(wrapped).toBeDefined();
    expect(wrapped?.opts.lineBreak).toBe(false);
  });
});

describe('PDF export — left-to-right is untouched', () => {
  let app: FastifyInstance;
  let textSpy: jest.SpyInstance;

  beforeEach(async () => {
    textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    app = Fastify();
    await app.register(exportRoutes, {});
    await app.ready();
  });

  afterEach(async () => {
    textSpy.mockRestore();
    await app.close();
  });

  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/export/pdf', payload });

  it('still produces a valid PDF for English', async () => {
    const res = await post({ text: ENGLISH_MARKDOWN });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  /**
   * The whole right-to-left path has to be inert for left-to-right output: no
   * alignment forced, no line breaking taken away, no text rewritten.
   */
  it('adds no alignment or line-break options to English text', async () => {
    await post({ text: ENGLISH_MARKDOWN, language: 'en' });
    for (const call of textCalls(textSpy)) {
      expect(call.opts.align).toBeUndefined();
      expect(call.opts.lineBreak).toBeUndefined();
    }
  });

  it('passes English strings through unrewritten', async () => {
    await post({ text: ENGLISH_MARKDOWN, language: 'en' });
    const all = textCalls(textSpy).map((c) => c.text).join('\n');
    expect(all).toContain('My trip');
    expect(all).toContain('Found 3 flights from Tel Aviv to Rome for €397.');
  });

  it('treats Russian as left-to-right', async () => {
    await post({ text: '# Мой маршрут\n\nНайдено 3 рейса за 397 евро.\n', language: 'ru' });
    const all = textCalls(textSpy);
    expect(all.map((c) => c.text).join('\n')).toContain('Найдено 3 рейса за 397 евро.');
    for (const call of all) expect(call.opts.align).toBeUndefined();
  });

  it('produces the same output whether or not the language is stated', async () => {
    const text = '# Trip\n\nFound 3 flights near Rome.\n';
    const a = await post({ text });
    const b = await post({ text, language: 'en' });
    // PDFs embed a creation timestamp, so compare size rather than bytes.
    expect(Math.abs(a.rawPayload.length - b.rawPayload.length)).toBeLessThan(64);
  });

  it('ignores a language it does not support', async () => {
    const res = await post({ text: ENGLISH_MARKDOWN, language: 'klingon' });
    expect(res.statusCode).toBe(200);
    for (const call of textCalls(textSpy)) expect(call.opts.align).toBeUndefined();
  });
});

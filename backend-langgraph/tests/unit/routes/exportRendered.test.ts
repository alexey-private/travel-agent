import Fastify, { FastifyInstance } from 'fastify';
import { PDFParse } from 'pdf-parse';
import { exportRoutes } from '@/routes/export';

/**
 * What the finished PDF says, rather than what we asked pdfkit to draw.
 *
 * Every other export test watches the calls pdfkit received, and that is exactly
 * why a real Hebrew export could come out unreadable while the suite was green:
 * the string handed to `doc.text` was in the right order, and then fontkit
 * reversed every word of it again on its way to the page. Reading the document
 * back is the only assertion that can see that.
 *
 * `pdf-parse` decodes the glyphs through the font's ToUnicode map and puts the
 * result back into logical order, so a correct document reads exactly like the
 * markdown that produced it — and a double-flipped one comes back with every
 * word spelled backwards, which is what this file pins down. The dependency is
 * already here: the chat route reads uploaded PDFs with it.
 */
const HEBREW_MARKDOWN = `# תוכנית הטיול שלי

נמצאו 4 אפשרויות מעולות! הנה השוואה מלאה:

| מה כלול | G Adventures | Cox & Kings |
|---------|--------------|-------------|
| ארוחת בוקר | ✅ | ✅ |
| ביטוח נסיעות | ❌ | ✅ |
| טיסות פנים | ❌ | ✅ |

- לבדוק דרכון
- להזמין מלון ב-397 אירו
`;

async function readBack(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  const { text } = await parser.getText();
  return text;
}

describe('PDF export — what the page actually says', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(exportRoutes, {});
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const exportPdf = async (payload: Record<string, unknown>): Promise<string> => {
    const res = await app.inject({ method: 'POST', url: '/api/export/pdf', payload });
    expect(res.statusCode).toBe(200);
    return readBack(res.rawPayload);
  };

  it('reads back as the Hebrew that was sent, not word-by-word backwards', async () => {
    const text = await exportPdf({ text: HEBREW_MARKDOWN, language: 'he' });

    expect(text).toContain('תוכנית הטיול שלי');
    // The heading with each word reversed — what a real export came out as.
    expect(text).not.toContain('תינכות');
  });

  it('keeps a price the right way round inside a Hebrew line', async () => {
    const text = await exportPdf({ text: HEBREW_MARKDOWN, language: 'he' });

    expect(text).toContain('397');
    expect(text).not.toContain('793');
  });

  it('fills the cells of a comparison table', async () => {
    const text = await exportPdf({ text: HEBREW_MARKDOWN, language: 'he' });

    // ✅ and ❌ have no glyph in DejaVu and used to be stripped to nothing,
    // leaving a table whose only filled column was the row labels.
    expect(text).toContain('✓');
    expect(text).toContain('✗');
    expect(text).toContain('ביטוח נסיעות');
  });

  it('keeps the Arabic presentation forms the emoji strip used to eat', async () => {
    // U+FE8D and U+FEDF are inside the range the strip once cleared wholesale,
    // and inside the range the shared script ranges call right-to-left.
    const text = await exportPdf({ text: 'ﺍ ﻟ\n' });

    expect(text).toContain('ﺍ');
    expect(text).toContain('ﻟ');
  });

  it('reads back as the English that was sent', async () => {
    const text = await exportPdf({
      text: '# My trip\n\nFound 3 flights from Tel Aviv to Rome for €397.\n',
      language: 'en',
    });

    expect(text).toContain('My trip');
    expect(text).toContain('Found 3 flights from Tel Aviv to Rome for €397.');
  });

  it('reads back as the Russian that was sent', async () => {
    const text = await exportPdf({
      text: '# Мой маршрут\n\nНайдено 3 рейса за 397 евро.\n',
      language: 'ru',
    });

    expect(text).toContain('Мой маршрут');
    expect(text).toContain('Найдено 3 рейса за 397 евро.');
  });
});

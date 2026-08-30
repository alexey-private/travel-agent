import path from 'path';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import PDFDocument from 'pdfkit';
import { openSync, type Font } from 'fontkit';
import { DriveProvider } from '../tools/providers/DriveProvider';
import { toVisual, wrapToWidth, baseDirFor, type BaseDir } from '../utils/bidi';
import { isLocale, type Locale } from '../i18n/locale';
import { rateLimitKey } from '../security/rateLimitKey';

// Fonts bundled with the backend — DejaVuSans covers Latin + Cyrillic + Greek etc.
const FONTS_DIR = path.resolve(__dirname, '../assets/fonts');

/** One bundled face, parsed. A `.ttf` holds exactly one; a collection would need a name to pick from. */
function face(file: string): Font {
  const font = openSync(path.join(FONTS_DIR, file));
  if (!('layout' in font)) {
    throw new Error(`${file} is a font collection, not a single face`);
  }
  return font;
}

/**
 * The five faces, parsed once for the life of the process.
 *
 * `registerFont(name, filename)` hands pdfkit a path and pdfkit opens it again
 * for every document — and reading the file is not the expensive half. fontkit
 * decodes the tables lazily, builds a cmap processor and a layout engine and
 * caches glyphs on the font object, and all of that memoised state is discarded
 * with the document that provoked it. Measured here: an export costs 28.5 ms
 * with paths and 4.2 ms with the faces shared. Caching the file *buffers*
 * instead measures 27.3 ms — that is, nothing: `readFileSync` on all five costs
 * 0.6 ms and `openSync` 0.3 ms, so the saving is entirely in what fontkit
 * builds on top of them.
 *
 * Sharing one face across documents is safe. pdfkit gives every document its
 * own subset and its own layout cache, `font.layout()` returns a fresh run each
 * call rather than a shared one to be scaled twice, and the caches fontkit keeps
 * on the face are bounded by the font itself. Nothing here is per-request state.
 */
const FONT = {
  Regular:     face('DejaVuSans.ttf'),
  Bold:        face('DejaVuSans-Bold.ttf'),
  BoldOblique: face('DejaVuSans-BoldOblique.ttf'),
  Oblique:     face('DejaVuSansCondensed-Oblique.ttf'),
  Mono:        face('DejaVuSansMono.ttf'),
};

/**
 * pdfkit accepts a parsed fontkit face wherever it accepts a path or a buffer —
 * `PDFFontFactory.open` takes any `src` carrying a `layout` method — but its
 * published types stop at `string | Buffer | Uint8Array | ArrayBuffer`.
 */
function registerFonts(doc: PDFKit.PDFDocument): void {
  for (const [name, font] of Object.entries(FONT)) {
    doc.registerFont(name, font as unknown as Buffer);
  }
}

/**
 * The longest text that will be typeset into a PDF.
 *
 * `buildPdfBuffer` is synchronous work on the event loop — pdfkit measures and
 * paints every glyph — so a body the request limit still accepts (25 MB) would
 * hold the whole server for as long as it takes. 50 000 characters is about
 * twenty-five pages, well past the longest answer an agent has produced, and
 * costs roughly 100 ms of ordinary prose.
 */
const MAX_PDF_TEXT_CHARS = 50_000;

/**
 * The longest run without a space.
 *
 * Length alone does not bound the work: pdfkit's line breaking is quadratic in
 * the length of a single unbreakable token, so the cost is in the shape of the
 * text, not its size. Measured on this machine: 50 000 characters of prose take
 * 72 ms, 2 000 characters with no space in them take 136 ms, and 10 000 take
 * 1.7 seconds — 100 000 exhausts the heap. A cap on the whole text would still
 * let one such word through. 500 characters holds any real URL and keeps the
 * worst case a text can buy under half a second.
 */
const MAX_PDF_TOKEN_CHARS = 500;

/** Both export routes: PDF generation is CPU-bound and, on the Drive path, hits Google too. */
const EXPORT_RATE_LIMIT = { max: 10, timeWindow: 60_000, keyGenerator: rateLimitKey };

/** `null` when the text may be typeset; otherwise the reply to send instead. */
function unprintable(text: string): { error: string; code: string } | null {
  if (text.length > MAX_PDF_TEXT_CHARS) {
    return { error: `text must be at most ${MAX_PDF_TEXT_CHARS} characters`, code: 'text_too_long' };
  }
  // Whitespace of any kind ends a run: a newline breaks a line as surely as a
  // space does, and pdfkit measures what lies between them.
  for (const run of text.split(/\s+/)) {
    if (run.length > MAX_PDF_TOKEN_CHARS) {
      return {
        error: `text must not contain a run of more than ${MAX_PDF_TOKEN_CHARS} characters without a space`,
        code: 'text_unbreakable_run',
      };
    }
  }
  return null;
}

interface ExportBody {
  text: string;
  filename?: string;
  language?: string;
}

interface ExportToDriveBody {
  text: string;
  userId: string;
  agentType?: 'travel' | 'shopping';
  filename?: string;
  language?: string;
}

interface ExportRoutesOptions {
  travelDriveProvider?: DriveProvider;
  shoppingDriveProvider?: DriveProvider;
}

/**
 * The document's language, or nothing.
 *
 * Nothing is a real answer, not a failure: `baseDirFor` then reads the direction
 * off the text. A value we do not support is dropped for the same reason — better
 * to sniff than to trust it.
 */
function requestedLocale(language: string | undefined): Locale | undefined {
  return isLocale(language) ? language : undefined;
}

async function buildPdfBuffer(text: string, language?: Locale): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  registerFonts(doc);

  // The document has one direction, taken from the language the user is reading
  // the app in. Without one, the text itself decides — an export triggered before
  // any language was stored still has to come out readable.
  const baseDir = baseDirFor(language, text);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>(resolve => {
    doc.on('end', resolve);
    renderMarkdown(doc, text, baseDir);
    doc.end();
  });

  return Buffer.concat(chunks);
}

export async function exportRoutes(fastify: FastifyInstance, opts: ExportRoutesOptions = {}): Promise<void> {
  fastify.post<{ Body: ExportBody }>(
    '/api/export/pdf',
    { config: { rateLimit: EXPORT_RATE_LIMIT } },
    async (request: FastifyRequest<{ Body: ExportBody }>, reply: FastifyReply) => {
      const { text, filename = 'agent-response', language } = request.body;
      if (!text) return reply.status(400).send({ error: 'text is required', code: 'text_required' });
      const refused = unprintable(text);
      if (refused) return reply.status(413).send(refused);

      const pdf = await buildPdfBuffer(text, requestedLocale(language));
      const safeFilename = filename.replace(/[^a-z0-9_\- ]/gi, '_');
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`)
        .send(pdf);
    },
  );

  fastify.post<{ Body: ExportToDriveBody }>(
    '/api/export/pdf-to-drive',
    { config: { rateLimit: EXPORT_RATE_LIMIT } },
    async (request: FastifyRequest<{ Body: ExportToDriveBody }>, reply: FastifyReply) => {
      const { text, userId, agentType = 'travel', filename = 'agent-response', language } = request.body;
      if (!text)   return reply.status(400).send({ error: 'text is required', code: 'text_required' });
      if (!userId) return reply.status(400).send({ error: 'userId is required', code: 'user_id_required' });
      const refused = unprintable(text);
      if (refused) return reply.status(413).send(refused);

      const provider = agentType === 'shopping' ? opts.shoppingDriveProvider : opts.travelDriveProvider;
      if (!provider) return reply.status(503).send({ error: 'Google Drive is not configured on this server.', code: 'drive_not_configured' });

      const pdf = await buildPdfBuffer(text, requestedLocale(language));
      const safeFilename = `${filename.replace(/[^a-z0-9_\- ]/gi, '_')}.pdf`;

      const result = await provider.create({
        userId,
        name: safeFilename,
        content: pdf,
        mimeType: 'application/pdf',
      });

      if (!result.success) return reply.status(502).send({ error: result.error, code: 'drive_upload_failed' });
      const data = result.data as { file?: { webViewLink?: string } } | undefined;
      reply.send({ webViewLink: data?.file?.webViewLink, name: safeFilename });
    },
  );
}

// ── Directional text ─────────────────────────────────────────────────────────

/**
 * The single place where text reaches the page.
 *
 * For left-to-right output it is a pass-through, so English and Russian PDFs
 * render exactly as they did before this existed. For right-to-left output it
 * wraps the text itself, reorders each resulting line, and aligns right — in
 * that order, because the bidirectional algorithm is defined per visual line and
 * letting pdfkit wrap already-reordered text would scramble it.
 *
 * `x`/`y` are for table cells, which position each cell explicitly.
 */
function write(
  doc: PDFKit.PDFDocument,
  text: string,
  baseDir: BaseDir,
  opts: PDFKit.Mixins.TextOptions = {},
  x?: number,
  y?: number,
): void {
  const emit = (content: string, options: PDFKit.Mixins.TextOptions): void => {
    if (x === undefined || y === undefined) doc.text(content, options);
    else doc.text(content, x, y, options);
  };

  if (baseDir === 'ltr') {
    emit(text, opts);
    return;
  }

  // pdfkit's `indent` only ever pushes from the left, which under rtl is the far
  // end of the line. The inset is folded into a narrower column instead, so it
  // lands where a Hebrew reader starts reading.
  const { indent = 0, width: explicitWidth, ...rest } = opts;
  const margins = doc.page.margins as { left: number; right: number };
  const width = explicitWidth ?? doc.page.width - margins.left - margins.right - indent;

  const lines = wrapToWidth(text, width, (s) => doc.widthOfString(s));
  const visual = lines.map(line => toVisual(line, 'rtl')).join('\n');

  emit(visual, { ...rest, width, align: 'right', lineBreak: false });
}

/**
 * How tall `write` will actually draw this text.
 *
 * Under rtl the line breaks are ours, not pdfkit's, so the height has to be
 * counted the same way — asking pdfkit to measure text it will not be wrapping
 * gives a row too short for its own contents.
 */
function heightOf(doc: PDFKit.PDFDocument, text: string, baseDir: BaseDir, width: number): number {
  if (baseDir === 'ltr') return doc.heightOfString(text, { width });
  const lines = wrapToWidth(text, width, (s) => doc.widthOfString(s));
  return lines.length * doc.currentLineHeight();
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(doc: PDFKit.PDFDocument, text: string, baseDir: BaseDir): void {
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Collect table block (consecutive lines with leading |)
    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      renderTable(doc, tableLines, baseDir);
      continue;
    }

    // Heading 1
    if (line.startsWith('# ')) {
      doc.fontSize(20).font('Bold');
      write(doc, clean(line.slice(2)), baseDir);
      doc.moveDown(0.4).fontSize(11).font('Regular');

    // Heading 2
    } else if (line.startsWith('## ')) {
      doc.fontSize(16).font('Bold');
      write(doc, clean(line.slice(3)), baseDir);
      doc.moveDown(0.3).fontSize(11).font('Regular');

    // Heading 3
    } else if (line.startsWith('### ')) {
      doc.fontSize(13).font('Bold');
      write(doc, clean(line.slice(4)), baseDir);
      doc.moveDown(0.2).fontSize(11).font('Regular');

    // Unordered list. The marker is written logically, at the head of the string —
    // the bidirectional algorithm is what moves it to the right edge under rtl.
    } else if (/^[-*] /.test(line)) {
      renderInline(doc, `• ${line.slice(2)}`, 11, baseDir, { indent: 15 });

    // Ordered list
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1] ?? '1';
      renderInline(doc, `${num}. ${line.replace(/^\d+\. /, '')}`, 11, baseDir, { indent: 15 });

    // Blockquote
    } else if (line.startsWith('> ')) {
      doc.fontSize(11).font('Oblique');
      write(doc, clean(line.slice(2)), baseDir, { indent: 20 });
      doc.font('Regular');

    // Fenced code block
    } else if (line.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (codeLines.length > 0) {
        // Code stays left-to-right whatever the document direction: it has none.
        doc.fontSize(9).font('Mono').text(codeLines.join('\n'), { indent: 10 });
        doc.moveDown(0.3).fontSize(11).font('Regular');
      }

    // Blank line / horizontal rule
    } else if (line.trim() === '' || line.startsWith('---')) {
      doc.moveDown(0.5);

    // Normal paragraph text
    } else {
      const content = clean(line);
      if (content.trim()) renderInline(doc, line, 11, baseDir);
    }

    i++;
  }
}

// ── Table renderer ───────────────────────────────────────────────────────────

function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

function parseTableRows(tableLines: string[]): string[][] {
  return tableLines
    .filter(l => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))   // drop separator rows
    .map(l =>
      l.trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(c => c.trim()),
    );
}

function renderTable(doc: PDFKit.PDFDocument, tableLines: string[], baseDir: BaseDir): void {
  const rows = parseTableRows(tableLines);
  if (rows.length === 0) return;

  const margins   = doc.page.margins as { left: number; right: number; top: number; bottom: number };
  const pageWidth = doc.page.width - margins.left - margins.right;
  const colCount  = Math.max(...rows.map(r => r.length));
  const cellPad   = 5;
  const fontSize  = 9;
  const minRowH   = 20;
  const minColW   = 55;

  const cleanRows = rows.map(row => row.slice(0, colCount).map(cell => clean(cell)));

  // Size columns proportionally to their longest content, with a floor so narrow
  // columns (e.g. "Stars") don't get squeezed to nothing by wide neighbors.
  const colMaxLen = new Array(colCount).fill(0);
  cleanRows.forEach(row => row.forEach((cell, i) => { colMaxLen[i] = Math.max(colMaxLen[i], cell.length || 1); }));
  const totalLen  = colMaxLen.reduce((a, b) => a + b, 0);
  let colWidths   = colMaxLen.map(len => Math.max(minColW, (len / totalLen) * pageWidth));
  const widthSum  = colWidths.reduce((a, b) => a + b, 0);
  if (widthSum > pageWidth) colWidths = colWidths.map(w => (w / widthSum) * pageWidth);
  // Column order mirrors under rtl: the first column of the markdown table is the
  // rightmost one on the page, so a column is offset by the widths of the columns
  // that follow it rather than those that precede it.
  const colX = colWidths.map((_, i) => {
    const preceding = baseDir === 'rtl' ? colWidths.slice(i + 1) : colWidths.slice(0, i);
    return margins.left + preceding.reduce((a, b) => a + b, 0);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).y as number;

  cleanRows.forEach((cellTexts, rowIdx) => {
    const isHeader = rowIdx === 0;
    doc.fontSize(fontSize).font(isHeader ? 'Bold' : 'Regular');

    const rowH = Math.max(
      minRowH,
      ...cellTexts.map((text, i) => heightOf(doc, text, baseDir, colWidths[i] - cellPad * 2) + cellPad * 2),
    );

    // Page break if needed
    if (y + rowH > doc.page.height - margins.bottom) {
      doc.addPage();
      y = margins.top;
    }

    // Header shading
    if (isHeader) {
      doc.save()
        .rect(margins.left, y, pageWidth, rowH)
        .fillColor('#f0f0f0')
        .fill()
        .restore();
    }

    // Row outline
    doc.rect(margins.left, y, pageWidth, rowH)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();

    cellTexts.forEach((text, colIdx) => {
      const x = colX[colIdx];

      // Column separator. Which index is the leftmost column depends on the
      // direction, so key off the position: only the table's own left border sits
      // exactly on the margin, and that one is already drawn by the row outline.
      if (x > margins.left) {
        doc.moveTo(x, y).lineTo(x, y + rowH)
          .strokeColor('#cccccc').lineWidth(0.5).stroke();
      }

      doc.fillColor('#000000');
      write(doc, text, baseDir, { width: colWidths[colIdx] - cellPad * 2 }, x + cellPad, y + cellPad);
    });

    y += rowH;
  });

  // Advance doc cursor past the table and reset x — pdfkit's text() with an
  // explicit x leaves doc.x pinned at the last column, which otherwise wraps
  // all following paragraphs into a sliver at the right margin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).y = y + 4;
  doc.x = margins.left;
  doc.fontSize(11).font('Regular');
  doc.moveDown(0.5);
}

// ── Inline rendering (bold segments) ────────────────────────────────────────

function renderInline(
  doc: PDFKit.PDFDocument,
  text: string,
  fontSize: number,
  baseDir: BaseDir,
  opts: PDFKit.Mixins.TextOptions = {},
): void {
  const cleaned = stripEmoji(text);

  if (baseDir === 'rtl') {
    // Bold segments are stitched back into one run and written in the regular
    // font. Emphasis is drawn with `continued`, which appends each segment where
    // the last one ended — incompatible with breaking the lines ourselves, which
    // right-to-left text requires. A Hebrew paragraph that loses its bold is a
    // smaller loss than one whose words come out in the wrong order.
    doc.fontSize(fontSize).font('Regular');
    write(doc, stripInline(cleaned), baseDir, opts);
    return;
  }

  // Split at **bold** boundaries
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/);
  const lastIdx = parts.length - 1;

  doc.fontSize(fontSize);
  parts.forEach((part, i) => {
    if (!part) return;
    const isBold    = part.startsWith('**') && part.endsWith('**');
    const content   = isBold ? part.slice(2, -2) : stripInline(part);
    const continued = i < lastIdx;

    doc.font(isBold ? 'Bold' : 'Regular')
      .text(content, { continued, ...opts });

    // opts (like indent) apply only to the first segment
    if (i === 0) opts = {};
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip emoji characters (outside BMP + common symbol ranges). */
function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    // Keep ★ U+2605 / ☆ U+2606 — used for star ratings and rendered fine by DejaVuSans.
    .replace(/[\u{2600}-\u{2604}\u{2607}-\u{27BF}]/gu, '')
    .replace(/[\u{2B00}-\u{2BFF}]/gu,   '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu,   '')
    .trim();
}

/** Strip all inline markdown markers (bold, italic, code, links, strikethrough). */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,     '$1')
    .replace(/`(.+?)`/g,       '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/~~(.+?)~~/g,     '$1');
}

/** Emoji-strip + inline markdown strip for plain contexts (headings, blockquotes). */
function clean(text: string): string {
  return stripInline(stripEmoji(text));
}

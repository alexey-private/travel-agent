import path from 'path';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import PDFDocument from 'pdfkit';
import { DriveProvider } from '../tools/providers/DriveProvider';

// Fonts bundled with the backend — DejaVuSans covers Latin + Cyrillic + Greek etc.
const FONTS_DIR = path.resolve(__dirname, '../assets/fonts');
const FONT = {
  regular:     path.join(FONTS_DIR, 'DejaVuSans.ttf'),
  bold:        path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),
  boldOblique: path.join(FONTS_DIR, 'DejaVuSans-BoldOblique.ttf'),
  oblique:     path.join(FONTS_DIR, 'DejaVuSansCondensed-Oblique.ttf'),
  mono:        path.join(FONTS_DIR, 'DejaVuSansMono.ttf'),
};

interface ExportBody {
  text: string;
  filename?: string;
}

interface ExportToDriveBody {
  text: string;
  userId: string;
  agentType?: 'travel' | 'shopping';
  filename?: string;
}

interface ExportRoutesOptions {
  travelDriveProvider?: DriveProvider;
  shoppingDriveProvider?: DriveProvider;
}

async function buildPdfBuffer(text: string): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.registerFont('Regular',     FONT.regular);
  doc.registerFont('Bold',        FONT.bold);
  doc.registerFont('BoldOblique', FONT.boldOblique);
  doc.registerFont('Oblique',     FONT.oblique);
  doc.registerFont('Mono',        FONT.mono);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>(resolve => {
    doc.on('end', resolve);
    renderMarkdown(doc, text);
    doc.end();
  });

  return Buffer.concat(chunks);
}

export async function exportRoutes(fastify: FastifyInstance, opts: ExportRoutesOptions = {}): Promise<void> {
  fastify.post<{ Body: ExportBody }>(
    '/api/export/pdf',
    async (request: FastifyRequest<{ Body: ExportBody }>, reply: FastifyReply) => {
      const { text, filename = 'agent-response' } = request.body;
      if (!text) return reply.status(400).send({ error: 'text is required' });

      const pdf = await buildPdfBuffer(text);
      const safeFilename = filename.replace(/[^a-z0-9_\- ]/gi, '_');
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`)
        .send(pdf);
    },
  );

  fastify.post<{ Body: ExportToDriveBody }>(
    '/api/export/pdf-to-drive',
    async (request: FastifyRequest<{ Body: ExportToDriveBody }>, reply: FastifyReply) => {
      const { text, userId, agentType = 'travel', filename = 'agent-response' } = request.body;
      if (!text)   return reply.status(400).send({ error: 'text is required' });
      if (!userId) return reply.status(400).send({ error: 'userId is required' });

      const provider = agentType === 'shopping' ? opts.shoppingDriveProvider : opts.travelDriveProvider;
      if (!provider) return reply.status(503).send({ error: 'Google Drive is not configured on this server.' });

      const pdf = await buildPdfBuffer(text);
      const safeFilename = `${filename.replace(/[^a-z0-9_\- ]/gi, '_')}.pdf`;

      const result = await provider.create({
        userId,
        name: safeFilename,
        content: pdf,
        mimeType: 'application/pdf',
      });

      if (!result.success) return reply.status(502).send({ error: result.error });
      const data = result.data as { file?: { webViewLink?: string } } | undefined;
      reply.send({ webViewLink: data?.file?.webViewLink, name: safeFilename });
    },
  );
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(doc: PDFKit.PDFDocument, text: string): void {
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
      renderTable(doc, tableLines);
      continue;
    }

    // Heading 1
    if (line.startsWith('# ')) {
      doc.fontSize(20).font('Bold').text(clean(line.slice(2)));
      doc.moveDown(0.4).fontSize(11).font('Regular');

    // Heading 2
    } else if (line.startsWith('## ')) {
      doc.fontSize(16).font('Bold').text(clean(line.slice(3)));
      doc.moveDown(0.3).fontSize(11).font('Regular');

    // Heading 3
    } else if (line.startsWith('### ')) {
      doc.fontSize(13).font('Bold').text(clean(line.slice(4)));
      doc.moveDown(0.2).fontSize(11).font('Regular');

    // Unordered list
    } else if (/^[-*] /.test(line)) {
      renderInline(doc, `• ${line.slice(2)}`, 11, { indent: 15 });

    // Ordered list
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1] ?? '1';
      renderInline(doc, `${num}. ${line.replace(/^\d+\. /, '')}`, 11, { indent: 15 });

    // Blockquote
    } else if (line.startsWith('> ')) {
      doc.fontSize(11).font('Oblique').text(clean(line.slice(2)), { indent: 20 });
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
        doc.fontSize(9).font('Mono').text(codeLines.join('\n'), { indent: 10 });
        doc.moveDown(0.3).fontSize(11).font('Regular');
      }

    // Blank line / horizontal rule
    } else if (line.trim() === '' || line.startsWith('---')) {
      doc.moveDown(0.5);

    // Normal paragraph text
    } else {
      const content = clean(line);
      if (content.trim()) renderInline(doc, line, 11);
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

function renderTable(doc: PDFKit.PDFDocument, tableLines: string[]): void {
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
  const colX = colWidths.reduce<number[]>((acc, w, i) => {
    acc.push(i === 0 ? margins.left : acc[i - 1] + colWidths[i - 1]);
    return acc;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).y as number;

  cleanRows.forEach((cellTexts, rowIdx) => {
    const isHeader = rowIdx === 0;
    doc.fontSize(fontSize).font(isHeader ? 'Bold' : 'Regular');

    const rowH = Math.max(
      minRowH,
      ...cellTexts.map((text, i) => doc.heightOfString(text, { width: colWidths[i] - cellPad * 2 }) + cellPad * 2),
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

      // Column separator
      if (colIdx > 0) {
        doc.moveTo(x, y).lineTo(x, y + rowH)
          .strokeColor('#cccccc').lineWidth(0.5).stroke();
      }

      doc.fillColor('#000000')
        .text(text, x + cellPad, y + cellPad, { width: colWidths[colIdx] - cellPad * 2 });
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
  opts: Record<string, unknown> = {},
): void {
  const cleaned = stripEmoji(text);
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

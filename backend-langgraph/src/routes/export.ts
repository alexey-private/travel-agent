import path from 'path';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import PDFDocument from 'pdfkit';

// Fonts bundled with the backend — DejaVuSans covers Latin + Cyrillic + Greek etc.
const FONTS_DIR = path.resolve(__dirname, '../assets/fonts');
const FONT = {
  regular: path.join(FONTS_DIR, 'DejaVuSans.ttf'),
  bold: path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),
  boldOblique: path.join(FONTS_DIR, 'DejaVuSans-BoldOblique.ttf'),
  oblique: path.join(FONTS_DIR, 'DejaVuSansCondensed-Oblique.ttf'),
  mono: path.join(FONTS_DIR, 'DejaVuSansMono.ttf'),
};

interface ExportBody {
  text: string;
  filename?: string;
}

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: ExportBody }>(
    '/api/export/pdf',
    async (request: FastifyRequest<{ Body: ExportBody }>, reply: FastifyReply) => {
      const { text, filename = 'agent-response' } = request.body;
      if (!text) return reply.status(400).send({ error: 'text is required' });

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      doc.registerFont('Regular', FONT.regular);
      doc.registerFont('Bold', FONT.bold);
      doc.registerFont('BoldOblique', FONT.boldOblique);
      doc.registerFont('Oblique', FONT.oblique);
      doc.registerFont('Mono', FONT.mono);

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>(resolve => {
        doc.on('end', resolve);
        renderMarkdown(doc, text);
        doc.end();
      });

      const pdf = Buffer.concat(chunks);
      const safeFilename = filename.replace(/[^a-z0-9_\- ]/gi, '_');
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`)
        .send(pdf);
    },
  );
}

function renderMarkdown(doc: PDFKit.PDFDocument, text: string): void {
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      doc.fontSize(20).font('Bold').text(stripInline(line.slice(2)));
      doc.moveDown(0.4).fontSize(11).font('Regular');
    } else if (line.startsWith('## ')) {
      doc.fontSize(16).font('Bold').text(stripInline(line.slice(3)));
      doc.moveDown(0.3).fontSize(11).font('Regular');
    } else if (line.startsWith('### ')) {
      doc.fontSize(13).font('Bold').text(stripInline(line.slice(4)));
      doc.moveDown(0.2).fontSize(11).font('Regular');
    } else if (/^[-*] /.test(line)) {
      doc.fontSize(11).font('Regular').text(`• ${stripInline(line.slice(2))}`, { indent: 15 });
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1] ?? '1';
      doc.fontSize(11).font('Regular').text(
        `${num}. ${stripInline(line.replace(/^\d+\. /, ''))}`,
        { indent: 15 },
      );
    } else if (line.startsWith('> ')) {
      doc.fontSize(11).font('Oblique').text(stripInline(line.slice(2)), { indent: 20 });
      doc.font('Regular');
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
    } else if (line.trim() === '' || line.startsWith('---')) {
      doc.moveDown(0.5);
    } else {
      const content = stripInline(line);
      if (content.trim()) doc.fontSize(11).font('Regular').text(content);
    }

    i++;
  }
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1');
}

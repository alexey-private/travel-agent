import Fastify, { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import { exportRoutes } from '@/routes/export';

const MARKDOWN = `# My trip

Found 3 flights from Tel Aviv to Rome for **€397**, and *one* worth a look.

| Airline | Price |
|---------|-------|
| El Al   | €397  |

- check passport
- book a hotel

\`\`\`
itinerary.json
\`\`\`
`;

/**
 * The bytes that identify a document rather than describe it.
 *
 * Two exports of the same text differ in exactly two places — the creation date
 * and the file id — and both have to go before the payloads can be compared.
 * pdfkit writes the date as an indirect object, so the `(D:…)` literal stands on
 * its own rather than after a `/CreationDate` key; matching the key instead
 * matches nothing and leaves a test that fails whenever two exports fall either
 * side of a second.
 */
function withoutIdentity(pdf: Buffer): string {
  return pdf
    .toString('latin1')
    .replace(/\(D:\d{14}[^)]*\)/g, '')
    .replace(/\/ID \[[^\]]*\]/g, '');
}

type OpenSync = typeof import('fontkit').openSync;

/**
 * Stand a different `openSync` in front of fontkit's.
 *
 * The faces are parsed at module scope, so a substitution only counts if the
 * module registry is cleared and the route imported again afterwards — which is
 * also what makes the count below an import-time count rather than a per-call
 * one.
 */
function mockFontkit(replace: (real: OpenSync) => OpenSync): void {
  jest.resetModules();
  const actual = jest.requireActual('fontkit') as typeof import('fontkit');
  jest.doMock('fontkit', () => ({ ...actual, openSync: replace(actual.openSync) }));
}

async function exportApp(routes = exportRoutes): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(routes, {});
  await app.ready();
  return app;
}

const post = (app: FastifyInstance, text = MARKDOWN) =>
  app.inject({ method: 'POST', url: '/api/export/pdf', payload: { text } });

describe('PDF export — bundled fonts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('fontkit');
    jest.resetModules();
  });

  it('registers the parsed faces themselves, and the same objects every time', async () => {
    const spy = jest.spyOn(PDFDocument.prototype, 'registerFont');
    const app = await exportApp();
    try {
      await post(app);
      const first = spy.mock.calls.map((args) => args[1]);
      spy.mockClear();
      await post(app);
      const second = spy.mock.calls.map((args) => args[1]);

      expect(first).toHaveLength(5);
      // A path or a buffer would make pdfkit open and rebuild the face itself,
      // which is the whole cost this is here to avoid.
      for (const src of first) {
        expect(typeof (src as { layout?: unknown }).layout).toBe('function');
      }
      // Identity, not equality: a face parsed afresh per request would compare
      // equal in every way that matters to a reader and still cost the 24 ms.
      expect(second).toHaveLength(5);
      first.forEach((src, i) => expect(second[i]).toBe(src));
    } finally {
      await app.close();
    }
  });

  it('opens each face once at import, not once per export', async () => {
    let opened = 0;
    mockFontkit((real) => (...args) => {
      opened += 1;
      return real(...args);
    });

    const { exportRoutes: fresh } = await import('@/routes/export');
    const app = await exportApp(fresh);
    try {
      expect(opened).toBe(5);

      for (let i = 0; i < 3; i += 1) {
        expect((await post(app)).statusCode).toBe(200);
      }

      // Three exports, still five faces: the parsed fonts outlive the request.
      expect(opened).toBe(5);
    } finally {
      await app.close();
    }
  });

  it('produces the same document from a face it has already used', async () => {
    const app = await exportApp();
    try {
      const first = await post(app);
      const second = await post(app);

      // A face shared between documents would be a bug if either document left
      // state on it — a consumed subset, or a layout run scaled twice, would
      // show up here as a second export that does not match the first.
      expect(withoutIdentity(first.rawPayload)).toBe(withoutIdentity(second.rawPayload));
      expect(first.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await app.close();
    }
  });

  it('keeps a shared face intact across three exports in flight at once', async () => {
    const app = await exportApp();
    try {
      const reference = await post(app);
      const [a, b, c] = await Promise.all([post(app), post(app), post(app)]);

      for (const res of [a, b, c]) {
        expect(withoutIdentity(res.rawPayload)).toBe(withoutIdentity(reference.rawPayload));
      }
    } finally {
      await app.close();
    }
  });

  it('refuses a font file that holds a collection rather than one face', async () => {
    // A `.ttc` opens as a FontCollection, which has no `layout` and cannot be
    // handed to pdfkit — better a boot failure than a stack trace per export.
    mockFontkit(() => (() => ({ fonts: [] })) as unknown as OpenSync);

    await expect(import('@/routes/export')).rejects.toThrow(/font collection/);
  });
});

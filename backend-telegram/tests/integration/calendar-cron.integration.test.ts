/**
 * Integration tests for the Telegram calendar cron notifier.
 * Uses a real HTTP server instead of mocked fetch.
 *
 * Verifies the full notification flow:
 *   cron callback → fetch /api/users/telegram → fetch events/tasks → api.sendMessage
 */

import http from 'http';
import type { AddressInfo } from 'net';
import type { Api } from 'grammy';

// The cron reads BACKEND_URL from src/config. We override it per test via the
// factory below; this default keeps the module importable at load time.
jest.mock('../../src/config', () => ({ BACKEND_URL: process.env.__TEST_BACKEND_URL__ ?? '' }));

let capturedCallback: (() => Promise<void>) | null = null;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => Promise<void>) => { capturedCallback = cb; }),
}));

// ── Test server helpers ───────────────────────────────────────────────────────

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface RouteMap {
  [path: string]: object;
}

function startServer(routes: RouteMap): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const key = Object.keys(routes).find((k) => url.pathname.includes(k));
      if (key) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(routes[key]));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}

function buildMockApi(): jest.Mocked<Pick<Api, 'sendMessage'>> {
  return { sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }) };
}

async function loadCron(backendUrl: string) {
  capturedCallback = null;
  jest.resetModules();
  jest.mock('node-cron', () => ({
    schedule: jest.fn((_expr: string, cb: () => Promise<void>) => { capturedCallback = cb; }),
  }));
  jest.mock('../../src/config', () => ({ BACKEND_URL: backendUrl }));
  const mod = await import('../../src/notifier/calendar.cron');
  return mod.startCalendarCron;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('startCalendarCron (integration — real HTTP server)', () => {
  it('sends Telegram message when user has events tomorrow', async () => {
    const tomorrow_ = tomorrow();
    const { server, url } = await startServer({
      '/api/users/telegram': { sessionIds: ['tg-123456'] },
      '/calendar/events':    { upcoming: [{ id: 'e1', title: 'Doctor visit', date: tomorrow_, time: '10:00' }] },
      '/calendar/tasks':     { tasks: [] },
    });

    try {
      const startCalendarCron = await loadCron(url);
      const api = buildMockApi();
      startCalendarCron(api as unknown as Api);

      await capturedCallback!();

      expect(api.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Doctor visit'),
        expect.any(Object),
      );
    } finally {
      await stopServer(server);
    }
  });

  it('sends Telegram message when user has tasks due tomorrow', async () => {
    const { server, url } = await startServer({
      '/api/users/telegram': { sessionIds: ['tg-789'] },
      '/calendar/events':    { upcoming: [] },
      '/calendar/tasks':     { tasks: [{ id: 't1', title: 'Buy tickets', due: tomorrow(), status: 'needsAction' }] },
    });

    try {
      const startCalendarCron = await loadCron(url);
      const api = buildMockApi();
      startCalendarCron(api as unknown as Api);

      await capturedCallback!();

      expect(api.sendMessage).toHaveBeenCalledWith(
        789,
        expect.stringContaining('Buy tickets'),
        expect.any(Object),
      );
    } finally {
      await stopServer(server);
    }
  });

  it('does not send message when nothing is due tomorrow', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { server, url } = await startServer({
      '/api/users/telegram': { sessionIds: ['tg-111'] },
      '/calendar/events':    { upcoming: [{ id: 'e2', title: 'Past event', date: today }] },
      '/calendar/tasks':     { tasks: [] },
    });

    try {
      const startCalendarCron = await loadCron(url);
      const api = buildMockApi();
      startCalendarCron(api as unknown as Api);

      await capturedCallback!();

      expect(api.sendMessage).not.toHaveBeenCalled();
    } finally {
      await stopServer(server);
    }
  });

  it('handles multiple users independently', async () => {
    const tomorrow_ = tomorrow();
    const requestedPaths: string[] = [];

    const { server, url } = await startServer({
      '/api/users/telegram': { sessionIds: ['tg-100', 'tg-200'] },
      '/calendar/events':    { upcoming: [{ id: 'e3', title: 'Meeting', date: tomorrow_ }] },
      '/calendar/tasks':     { tasks: [] },
    });

    // Track which paths were hit
    server.on('request', (req) => requestedPaths.push(req.url ?? ''));

    try {
      const startCalendarCron = await loadCron(url);
      const api = buildMockApi();
      startCalendarCron(api as unknown as Api);

      await capturedCallback!();

      // Both users should have been notified
      expect(api.sendMessage).toHaveBeenCalledTimes(2);
      const calledIds = (api.sendMessage as jest.Mock).mock.calls.map((c) => c[0] as number);
      expect(calledIds).toContain(100);
      expect(calledIds).toContain(200);
    } finally {
      await stopServer(server);
    }
  });

  it('does not throw when the backend is unreachable', async () => {
    const startCalendarCron = await loadCron('http://127.0.0.1:1');
    const api = buildMockApi();
    startCalendarCron(api as unknown as Api);

    await expect(capturedCallback!()).resolves.toBeUndefined();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('formats notification with both events and tasks sections', async () => {
    const tomorrow_ = tomorrow();
    const { server, url } = await startServer({
      '/api/users/telegram': { sessionIds: ['tg-999'] },
      '/calendar/events':    { upcoming: [{ id: 'e4', title: 'Flight to Paris', date: tomorrow_, time: '08:30' }] },
      '/calendar/tasks':     { tasks: [{ id: 't2', title: 'Pack passport', due: tomorrow_, status: 'needsAction' }] },
    });

    try {
      const startCalendarCron = await loadCron(url);
      const api = buildMockApi();
      startCalendarCron(api as unknown as Api);

      await capturedCallback!();

      const message = (api.sendMessage as jest.Mock).mock.calls[0][1] as string;
      expect(message).toContain('Events');
      expect(message).toContain('Flight to Paris');
      expect(message).toContain('Tasks');
      expect(message).toContain('Pack passport');
    } finally {
      await stopServer(server);
    }
  });
});

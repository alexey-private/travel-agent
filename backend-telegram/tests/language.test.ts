import { getLocale, setLocale } from '../src/i18n/language';
import type { BotContext } from '../src/types';

function ctx(session: Record<string, unknown> = {}): BotContext {
  return { session: { sessionId: 'tg-42', locale: null, ...session } } as unknown as BotContext;
}

describe('bot language resolution', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('reads the language from the backend on first use', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ language: 'he' }) });
    const c = ctx();
    await expect(getLocale(c)).resolves.toBe('he');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('userId=tg-42'));
  });

  it('caches the language in the session', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ language: 'ru' }) });
    const c = ctx();
    await getLocale(c);
    await getLocale(c);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to English when the backend is unreachable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(getLocale(ctx())).resolves.toBe('en');
  });

  it('falls back to English when the backend returns nonsense', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ language: 'de' }) });
    await expect(getLocale(ctx())).resolves.toBe('en');
  });

  it('writes a new language to the backend and updates the cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const c = ctx();
    await setLocale(c, 'he');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('userId=tg-42'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(c.session.locale).toBe('he');
  });
});

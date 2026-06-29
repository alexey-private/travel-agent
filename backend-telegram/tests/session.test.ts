import { ensureSessionId } from '../src/session';
import type { BotContext } from '../src/types';

function makeCtx(overrides: Partial<BotContext> = {}): BotContext {
  return {
    session: { sessionId: null, conversationId: null, agentType: 'travel', suggestions: [], currentCity: null },
    from: { id: 42, is_bot: false, first_name: 'Test' },
    ...overrides,
  } as unknown as BotContext;
}

describe('ensureSessionId', () => {
  it('sets sessionId to "tg-<telegramUserId>" when from.id is present', () => {
    const ctx = makeCtx({ from: { id: 12345, is_bot: false, first_name: 'Alice' } });

    ensureSessionId(ctx);

    expect(ctx.session.sessionId).toBe('tg-12345');
  });

  it('generates an anon sessionId when ctx.from is undefined', () => {
    const ctx = makeCtx({ from: undefined });

    ensureSessionId(ctx);

    expect(ctx.session.sessionId).toMatch(/^tg-anon-[0-9a-f-]{36}$/);
  });

  it('does not overwrite an existing sessionId', () => {
    const ctx = makeCtx();
    ctx.session.sessionId = 'tg-existing-999';

    ensureSessionId(ctx);

    expect(ctx.session.sessionId).toBe('tg-existing-999');
  });

  it('generates unique anon IDs on consecutive calls with no from', () => {
    const ctx1 = makeCtx({ from: undefined });
    const ctx2 = makeCtx({ from: undefined });

    ensureSessionId(ctx1);
    ensureSessionId(ctx2);

    expect(ctx1.session.sessionId).not.toBe(ctx2.session.sessionId);
  });
});

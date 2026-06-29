import { registerModeCommand } from '../../src/commands/mode';
import { captureHandlers, makeCtx } from './helpers';

describe('/mode command', () => {
  const handlers = captureHandlers(registerModeCommand);

  it('shows Travel label when agentType is travel', async () => {
    const ctx = makeCtx({ agentType: 'travel', sessionId: 'tg-1' });
    await handlers.get('mode')!(ctx);
    const [text] = (ctx.reply as jest.Mock).mock.calls[0] as [string];
    expect(text).toContain('Travel');
    expect(text).toContain('tg-1');
  });

  it('shows Shopping label when agentType is shopping', async () => {
    const ctx = makeCtx({ agentType: 'shopping', sessionId: 'tg-2' });
    await handlers.get('mode')!(ctx);
    const [text] = (ctx.reply as jest.Mock).mock.calls[0] as [string];
    expect(text).toContain('Shopping');
  });

  it('omits session when sessionId is null', async () => {
    const ctx = makeCtx({ sessionId: null });
    await handlers.get('mode')!(ctx);
    const [text] = (ctx.reply as jest.Mock).mock.calls[0] as [string];
    expect(text).not.toContain('Session:');
  });
});

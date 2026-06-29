import { registerClearCommand } from '../../src/commands/clear';
import { captureHandlers, makeCtx } from './helpers';

describe('/clear command', () => {
  const handlers = captureHandlers(registerClearCommand);

  it('resets sessionId to null', async () => {
    const ctx = makeCtx({ sessionId: 'tg-123' });
    await handlers.get('clear')!(ctx);
    expect(ctx.session.sessionId).toBeNull();
  });

  it('replies with confirmation message', async () => {
    const ctx = makeCtx();
    await handlers.get('clear')!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Starting fresh'));
  });
});

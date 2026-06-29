import { registerAgentTypeCommands } from '../../src/commands/agent-type';
import { captureHandlers, makeCtx } from './helpers';

// getStarterKeyboard is imported inside agent-type → start; mock it to avoid side effects
jest.mock('../../src/commands/start', () => ({
  getStarterKeyboard: jest.fn().mockReturnValue({ inline_keyboard: [] }),
}));

describe('/travel command', () => {
  const handlers = captureHandlers(registerAgentTypeCommands);

  it('switches agentType to travel', async () => {
    const ctx = makeCtx({ agentType: 'shopping' });
    await handlers.get('travel')!(ctx);
    expect(ctx.session.agentType).toBe('travel');
  });

  it('replies with Travel Agent confirmation', async () => {
    const ctx = makeCtx();
    await handlers.get('travel')!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Travel Agent'),
      expect.any(Object),
    );
  });
});

describe('/shopping command', () => {
  const handlers = captureHandlers(registerAgentTypeCommands);

  it('switches agentType to shopping', async () => {
    const ctx = makeCtx({ agentType: 'travel' });
    await handlers.get('shopping')!(ctx);
    expect(ctx.session.agentType).toBe('shopping');
  });

  it('replies with Shopping Agent confirmation', async () => {
    const ctx = makeCtx();
    await handlers.get('shopping')!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Shopping Agent'),
      expect.any(Object),
    );
  });
});

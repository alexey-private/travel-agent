import { registerLocationCommand } from '../../src/commands/location';
import { captureHandlers, makeCtx } from './helpers';

describe('/location command', () => {
  const handlers = captureHandlers(registerLocationCommand);

  it('replies with "no location" when currentCity is null', async () => {
    const ctx = makeCtx({ currentCity: null });
    await handlers.get('location')!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No location saved'), expect.any(Object));
  });

  it('replies with the saved city when currentCity is set', async () => {
    const ctx = makeCtx({ currentCity: 'Paris, Île-de-France, FR' });
    await handlers.get('location')!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Paris, Île-de-France, FR'),
      expect.any(Object),
    );
  });
});

describe('/clearlocation command', () => {
  const handlers = captureHandlers(registerLocationCommand);

  it('clears currentCity and confirms the removed city', async () => {
    const ctx = makeCtx({ currentCity: 'Tokyo, Tokyo, JP' });
    await handlers.get('clearlocation')!(ctx);
    expect(ctx.session.currentCity).toBeNull();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Tokyo, Tokyo, JP'), expect.any(Object));
  });

  it('replies with "no location was set" when city was already null', async () => {
    const ctx = makeCtx({ currentCity: null });
    await handlers.get('clearlocation')!(ctx);
    expect(ctx.session.currentCity).toBeNull();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No location was set'), expect.any(Object));
  });
});

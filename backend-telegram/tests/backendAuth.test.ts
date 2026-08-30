/**
 * The bridge's half of the guard in
 * `backend-langgraph/src/security/internalAuth.ts`.
 *
 * Every backend call the bot makes names a `tg-` session id, and the backend
 * refuses those unless the caller proves it is this bridge. The proof travels
 * as a header — except on the `/connect` link, which a browser opens, and which
 * therefore carries a signature in its query string instead.
 *
 * `config.ts` reads the environment once at import, so each case loads the
 * modules fresh with the environment it wants.
 */

const SECRET = 'shared-between-the-two-services';

function loadWith(secret: string | undefined): typeof import('../src/backendAuth') {
  let mod!: typeof import('../src/backendAuth');
  jest.isolateModules(() => {
    const previous = process.env.INTERNAL_API_SECRET;
    if (secret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = secret;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../src/backendAuth');

    if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previous;
  });
  return mod;
}

describe('internalHeaders', () => {
  it('carries the secret and keeps the caller\'s own headers', () => {
    const { internalHeaders, INTERNAL_SECRET_HEADER } = loadWith(SECRET);
    expect(internalHeaders({ 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
      [INTERNAL_SECRET_HEADER]: SECRET,
    });
  });

  it('adds nothing when no secret is configured', () => {
    // The backend then answers 403, which is the intended outcome: a bot that
    // cannot prove who it is must not be able to read anyone's conversations.
    const { internalHeaders } = loadWith(undefined);
    expect(internalHeaders()).toEqual({});
  });
});

describe('signStartLink', () => {
  it('signs the id, the platform and the expiry together', () => {
    const { signStartLink } = loadWith(SECRET);
    const signed = signStartLink('tg-42', 'telegram');

    expect(signed).not.toBeNull();
    expect(signed!.exp).toBeGreaterThan(Date.now());

    // Reproduce the backend's check rather than trusting our own helper.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac } = require('crypto');
    const exp = String(signed!.exp);
    const expected = createHmac('sha256', SECRET)
      .update(`5:tg-42|8:telegram|${exp.length}:${exp}`)
      .digest('hex');
    expect(signed!.sig).toBe(expected);
  });

  it('expires inside the window the backend will accept', () => {
    // The backend refuses an expiry further out than 15 minutes; the bot stamps
    // a shorter one, and the difference is the clock skew the pair may have.
    const { signStartLink } = loadWith(SECRET);
    const signed = signStartLink('tg-42', 'telegram');
    expect(signed!.exp - Date.now()).toBeLessThan(15 * 60 * 1000);
  });

  it('refuses to mint a link at all when no secret is configured', () => {
    const { signStartLink } = loadWith(undefined);
    expect(signStartLink('tg-42', 'telegram')).toBeNull();
  });

  it('produces a different signature for a different user', () => {
    const { signStartLink } = loadWith(SECRET);
    const a = signStartLink('tg-1', 'telegram')!;
    const b = signStartLink('tg-2', 'telegram')!;
    expect(a.sig).not.toBe(b.sig);
  });
});

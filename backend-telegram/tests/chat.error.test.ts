/**
 * An `error` event arrives from `streamChat` already translated, with its
 * variable part escaped once. The handler used to pass it back through `t()`,
 * which escaped it a second time — an error quoting a URL reached the user as
 * `&amp;amp;` instead of `&`.
 */

jest.mock('../src/config', () => ({ BACKEND_URL: 'http://localhost:3002' }));

const streamChatMock = jest.fn();
jest.mock('../src/sse-client', () => ({
  streamChat: (...args: unknown[]) => streamChatMock(...args),
}));

import { handleChatMessage } from '../src/chat.handler';
import { makeCtx } from './commands/helpers';

function yields(...events: Array<Record<string, unknown>>): void {
  streamChatMock.mockImplementation(async function* () {
    for (const event of events) yield event;
  });
}

afterEach(() => jest.clearAllMocks());

describe('an error reported by the backend', () => {
  it('reaches the user escaped exactly once', async () => {
    const ctx = makeCtx();
    yields(
      { type: 'error', message: 'Sorry, something went wrong: R&amp;D &lt;svc&gt; is down' },
      { type: 'done' },
    );

    await handleChatMessage(ctx, 'hi');

    const edits = (ctx.api.editMessageText as jest.Mock).mock.calls;
    const rendered = edits[edits.length - 1][2] as string;

    expect(rendered).toContain('R&amp;D &lt;svc&gt; is down');
    expect(rendered).not.toContain('&amp;amp;');
    expect(rendered).not.toContain('&amp;lt;');
  });

  it('is sent as HTML', async () => {
    const ctx = makeCtx();
    yields({ type: 'error', message: 'Sorry, something went wrong: boom' }, { type: 'done' });

    await handleChatMessage(ctx, 'hi');

    const edits = (ctx.api.editMessageText as jest.Mock).mock.calls;
    expect(edits[edits.length - 1][3]).toEqual({ parse_mode: 'HTML' });
  });
});

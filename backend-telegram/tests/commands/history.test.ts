/**
 * `/history` echoes back text nobody on our side wrote: the user's own
 * messages and the model's replies, wrapped in `<i>` and sent with
 * `parse_mode: 'HTML'`. One `<` in a stored message used to make Telegram
 * reject the whole reply.
 */

jest.mock('../../src/config', () => ({ BACKEND_URL: 'http://localhost:3002' }));

import { registerHistoryCommand } from '../../src/commands/history';
import { captureHandlers, makeCtx } from './helpers';

const globalFetch = global.fetch;

function mockMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }>): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ messages }),
  });
}

afterEach(() => {
  global.fetch = globalFetch;
  jest.clearAllMocks();
});

describe('/history command', () => {
  const handlers = captureHandlers(registerHistoryCommand);

  async function renderedText(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const ctx = makeCtx({ conversationId: 'c1' });
    mockMessages(messages);
    await handlers.get('history')!(ctx);

    const edits = (ctx.api.editMessageText as jest.Mock).mock.calls;
    return edits[edits.length - 1][2] as string;
  }

  it('escapes the markup characters in a stored message', async () => {
    const text = await renderedText([
      { role: 'user', content: 'compare <b>Rome</b> & Milan' },
      { role: 'assistant', content: 'Rome > Milan for a weekend' },
    ]);

    expect(text).toContain('compare &lt;b&gt;Rome&lt;/b&gt; &amp; Milan');
    expect(text).toContain('Rome &gt; Milan for a weekend');
  });

  it('keeps its own italics markup around the escaped text', async () => {
    // The `<i>` is ours and must survive; only the interpolated half is escaped.
    const text = await renderedText([
      { role: 'user', content: 'a & b' },
      { role: 'assistant', content: 'ok' },
    ]);

    expect(text).toContain('<i>a &amp; b</i>');
  });

  it('sends the transcript as HTML', async () => {
    const ctx = makeCtx({ conversationId: 'c1' });
    mockMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    await handlers.get('history')!(ctx);

    const edits = (ctx.api.editMessageText as jest.Mock).mock.calls;
    expect(edits[edits.length - 1][3]).toEqual({ parse_mode: 'HTML' });
  });
});

import Anthropic from '@anthropic-ai/sdk';
import { TravelAgent } from '@/agent/TravelAgent';
import { AgentContext } from '@/agent/AgentContext';
import { ToolRegistry } from '@/tools/ToolRegistry';
import { AgentEvent } from '@/types/agent';

/** Drain an AsyncGenerator into an array. */
async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function buildContext(): AgentContext {
  return new AgentContext(
    'user-1',
    'conv-1',
    'Plan a trip to Tokyo',
    [],
    null,
    [],
  );
}

type FakeResponse = {
  stop_reason: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
};

/** Build a fake stream object that TravelAgent can iterate over and call finalMessage() on. */
function makeStreamMock(response: FakeResponse) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: block.text },
          };
        }
      }
    },
    finalMessage: jest.fn().mockResolvedValue(response),
  };
}

describe('TravelAgent', () => {
  let mockStream: jest.Mock;
  let mockAnthropicClient: Anthropic;
  let toolRegistry: ToolRegistry;
  let agent: TravelAgent;

  beforeEach(() => {
    mockStream = jest.fn();
    mockAnthropicClient = {
      messages: { stream: mockStream },
    } as unknown as Anthropic;

    toolRegistry = new ToolRegistry();
    agent = new TravelAgent(toolRegistry, mockAnthropicClient);
  });

  it('emits text and done events when Claude responds with end_turn', async () => {
    mockStream.mockReturnValueOnce(makeStreamMock({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Here is your Tokyo itinerary.' }],
    }));

    const events = await collectEvents(agent.run(buildContext()));

    expect(events).toContainEqual({ type: 'text', content: 'Here is your Tokyo itinerary.' });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('emits tool_start, tool_end, then final text when Claude uses a tool', async () => {
    // Register a mock tool
    const mockTool = {
      name: 'web_search',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: jest.fn().mockResolvedValue({ success: true, data: { results: [{ title: 'Tokyo info' }] } }),
      toAnthropicTool: () => ({
        name: 'web_search',
        description: 'Search the web',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
      }),
    };
    toolRegistry.register(mockTool as any);

    // First call: tool_use; second call: end_turn
    mockStream
      .mockReturnValueOnce(makeStreamMock({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'web_search', input: { query: 'Tokyo travel' } },
        ],
      }))
      .mockReturnValueOnce(makeStreamMock({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Based on the search, here is Tokyo info.' }],
      }));

    const events = await collectEvents(agent.run(buildContext()));

    expect(events).toContainEqual({ type: 'tool_start', tool: 'web_search', input: { query: 'Tokyo travel' } });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool_end', tool: 'web_search' }),
    );
    expect(events).toContainEqual({ type: 'text', content: 'Based on the search, here is Tokyo info.' });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it('emits tool_end with error and continues (self-correction) when a tool fails', async () => {
    const mockTool = {
      name: 'web_search',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: jest.fn().mockResolvedValue({ success: false, error: 'Rate limit exceeded' }),
      toAnthropicTool: () => ({
        name: 'web_search',
        description: 'Search the web',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
      }),
    };
    toolRegistry.register(mockTool as any);

    mockStream
      .mockReturnValueOnce(makeStreamMock({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'call-err', name: 'web_search', input: { query: 'Tokyo' } }],
      }))
      .mockReturnValueOnce(makeStreamMock({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'I could not search, but here are some general tips.' }],
      }));

    const events = await collectEvents(agent.run(buildContext()));

    const toolEnd = events.find(e => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.error).toBe('Rate limit exceeded');

    // Agent should still emit a final text after self-correcting
    expect(events).toContainEqual({
      type: 'text',
      content: 'I could not search, but here are some general tips.',
    });
    expect(events[events.length - 1]).toEqual({ type: 'done' });

    // The error was passed back to Claude as a tool_result with is_error: true
    const secondCallMessages = mockStream.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMsg.role).toBe('user');
    const toolResultContent = toolResultMsg.content[0];
    expect(toolResultContent.is_error).toBe(true);
  });

  it('prepends RAG context to the user message when provided', async () => {
    mockStream.mockReturnValueOnce(makeStreamMock({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Answer.' }],
    }));

    const ctx = new AgentContext('u', 'c', 'Visa to Japan?', [], 'Japan requires no visa for 90 days.', []);
    await collectEvents(agent.run(ctx));

    const messages = mockStream.mock.calls[0][0].messages;
    const userMessage = messages[messages.length - 1];
    expect(userMessage.content).toContain('Japan requires no visa for 90 days.');
    expect(userMessage.content).toContain('Visa to Japan?');
  });

  it('includes conversation history in the request', async () => {
    mockStream.mockReturnValueOnce(makeStreamMock({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sure.' }],
    }));

    const ctx = new AgentContext(
      'u', 'c', 'What about hotels?', [],
      null,
      [
        { role: 'user', content: 'I want to visit Tokyo.' },
        { role: 'assistant', content: 'Great choice!' },
      ],
    );

    await collectEvents(agent.run(ctx));

    const messages = mockStream.mock.calls[0][0].messages;
    // history (2) + current user message (1)
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'I want to visit Tokyo.' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Great choice!' });
  });
});

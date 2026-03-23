import { TravelAgent } from '@/agent/TravelAgent';
import { AgentContext } from '@/agent/AgentContext';
import { ToolRegistry } from '@/tools/ToolRegistry';
import { AgentEvent } from '@/types/agent';
import { LLMClient } from '@/llm/LLMClient';
import { LLMStreamEvent, LLMToolCall } from '@/llm/types';

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

/** Build an AsyncIterable that yields the given LLMStreamEvents. */
function makeStream(events: LLMStreamEvent[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

function stopEnd(text: string): LLMStreamEvent[] {
  return [
    { type: 'text_delta', text },
    { type: 'stop', reason: 'end_turn', toolCalls: [], assistantText: text },
  ];
}

function stopToolUse(toolCalls: LLMToolCall[]): LLMStreamEvent[] {
  return [{ type: 'stop', reason: 'tool_use', toolCalls, assistantText: '' }];
}

describe('TravelAgent', () => {
  let mockStream: jest.Mock;
  let llmClient: LLMClient;
  let toolRegistry: ToolRegistry;
  let agent: TravelAgent;

  beforeEach(() => {
    mockStream = jest.fn();
    llmClient = { stream: mockStream, complete: jest.fn() } as unknown as LLMClient;
    toolRegistry = new ToolRegistry();
    agent = new TravelAgent(toolRegistry, llmClient);
  });

  it('emits text and done events when the model responds with end_turn', async () => {
    mockStream.mockReturnValueOnce(makeStream(stopEnd('Here is your Tokyo itinerary.')));

    const events = await collectEvents(agent.run(buildContext()));

    expect(events).toContainEqual({ type: 'text', content: 'Here is your Tokyo itinerary.' });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('emits tool_start, tool_end, then final text when the model uses a tool', async () => {
    const mockTool = {
      name: 'web_search',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: jest.fn().mockResolvedValue({ success: true, data: { results: [{ title: 'Tokyo info' }] } }),
      toToolDefinition: () => ({
        name: 'web_search',
        description: 'Search the web',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      }),
    };
    toolRegistry.register(mockTool as any);

    mockStream
      .mockReturnValueOnce(
        makeStream(stopToolUse([{ id: 'call-1', name: 'web_search', input: { query: 'Tokyo travel' } }])),
      )
      .mockReturnValueOnce(makeStream(stopEnd('Based on the search, here is Tokyo info.')));

    const events = await collectEvents(agent.run(buildContext()));

    expect(events).toContainEqual({ type: 'tool_start', tool: 'web_search', input: { query: 'Tokyo travel' } });
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_end', tool: 'web_search' }));
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
      toToolDefinition: () => ({
        name: 'web_search',
        description: 'Search the web',
        inputSchema: { type: 'object', properties: {}, required: [] },
      }),
    };
    toolRegistry.register(mockTool as any);

    mockStream
      .mockReturnValueOnce(
        makeStream(stopToolUse([{ id: 'call-err', name: 'web_search', input: { query: 'Tokyo' } }])),
      )
      .mockReturnValueOnce(
        makeStream(stopEnd('I could not search, but here are some general tips.')),
      );

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

    // The error was passed back to the model as a tool result with isError: true
    const secondCallParams = mockStream.mock.calls[1][0];
    const toolMsg = secondCallParams.messages[secondCallParams.messages.length - 1];
    expect(toolMsg.role).toBe('tool');
    expect(toolMsg.results[0].isError).toBe(true);
  });

  it('prepends RAG context to the user message when provided', async () => {
    mockStream.mockReturnValueOnce(makeStream(stopEnd('Answer.')));

    const ctx = new AgentContext('u', 'c', 'Visa to Japan?', [], 'Japan requires no visa for 90 days.', []);
    await collectEvents(agent.run(ctx));

    const messages = mockStream.mock.calls[0][0].messages;
    const userMessage = messages[messages.length - 1];
    expect(userMessage.content).toContain('Japan requires no visa for 90 days.');
    expect(userMessage.content).toContain('Visa to Japan?');
  });

  it('includes conversation history in the request', async () => {
    mockStream.mockReturnValueOnce(makeStream(stopEnd('Sure.')));

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

import { ShoppingAgent } from '@/agent/ShoppingAgent';
import { AgentContext } from '@/agent/AgentContext';
import { ToolRegistry } from '@/tools/ToolRegistry';
import { BaseTool } from '@/tools/BaseTool';
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
    'Find me the best headphones under $200',
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

describe('ShoppingAgent', () => {
  let mockStream: jest.Mock;
  let llmClient: LLMClient;
  let toolRegistry: ToolRegistry;
  let agent: ShoppingAgent;

  beforeEach(() => {
    mockStream = jest.fn();
    llmClient = { stream: mockStream, complete: jest.fn() } as unknown as LLMClient;
    toolRegistry = new ToolRegistry();
    agent = new ShoppingAgent(toolRegistry, llmClient);
  });

  it('emits text and done events when the model responds with end_turn', async () => {
    mockStream.mockReturnValueOnce(makeStream(stopEnd('Here are the best headphones under $200.')));

    const events = await collectEvents(agent.run(buildContext()));

    expect(events).toContainEqual({ type: 'text', content: 'Here are the best headphones under $200.' });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('emits tool_start, tool_end, then final text when the model uses a tool', async () => {
    const mockTool = {
      name: 'search_products',
      description: 'Search for products',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { products: [{ name: 'Sony WH-1000XM5', price: 279.99 }] },
      }),
      toToolDefinition: () => ({
        name: 'search_products',
        description: 'Search for products',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      }),
    };
    toolRegistry.register(mockTool as unknown as BaseTool);

    mockStream
      .mockReturnValueOnce(
        makeStream(stopToolUse([{ id: 'call-1', name: 'search_products', input: { query: 'headphones' } }])),
      )
      .mockReturnValueOnce(makeStream(stopEnd('I found the Sony WH-1000XM5 for $279.99.')));

    const events = await collectEvents(agent.run(buildContext()));

    expect(events).toContainEqual({ type: 'tool_start', tool: 'search_products', input: { query: 'headphones' } });
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_end', tool: 'search_products' }));
    expect(events).toContainEqual({ type: 'text', content: 'I found the Sony WH-1000XM5 for $279.99.' });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it('emits tool_end with error and continues (self-correction) when a tool fails', async () => {
    const mockTool = {
      name: 'search_products',
      description: 'Search for products',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: jest.fn().mockResolvedValue({ success: false, error: 'No products found' }),
      toToolDefinition: () => ({
        name: 'search_products',
        description: 'Search for products',
        inputSchema: { type: 'object', properties: {}, required: [] },
      }),
    };
    toolRegistry.register(mockTool as unknown as BaseTool);

    mockStream
      .mockReturnValueOnce(
        makeStream(stopToolUse([{ id: 'call-err', name: 'search_products', input: { query: 'xyz123' } }])),
      )
      .mockReturnValueOnce(
        makeStream(stopEnd('I could not find that product. Try a broader search term.')),
      );

    const events = await collectEvents(agent.run(buildContext()));

    const toolEnd = events.find(e => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.error).toBe('No products found');

    expect(events).toContainEqual({
      type: 'text',
      content: 'I could not find that product. Try a broader search term.',
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

    const ctx = new AgentContext(
      'u', 'c',
      'Best noise-cancelling headphones?',
      [],
      'Sony WH-1000XM5 is rated #1 for noise cancellation.',
      [],
    );
    await collectEvents(agent.run(ctx));

    const messages = mockStream.mock.calls[0][0].messages;
    const userMessage = messages[messages.length - 1];
    expect(userMessage.content).toContain('Sony WH-1000XM5 is rated #1 for noise cancellation.');
    expect(userMessage.content).toContain('Best noise-cancelling headphones?');
  });

  it('includes conversation history in the request', async () => {
    mockStream.mockReturnValueOnce(makeStream(stopEnd('Sure.')));

    const ctx = new AgentContext(
      'u', 'c', 'What about the price?', [],
      null,
      [
        { role: 'user', content: 'I need headphones for travel.' },
        { role: 'assistant', content: 'I recommend noise-cancelling models.' },
      ],
    );

    await collectEvents(agent.run(ctx));

    const messages = mockStream.mock.calls[0][0].messages;
    // history (2) + current user message (1)
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'I need headphones for travel.' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'I recommend noise-cancelling models.' });
  });
});

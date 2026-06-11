import { END } from '@langchain/langgraph';
import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { shouldContinue } from '@/graph/nodes/shouldContinue';
import { AgentStateType } from '@/graph/state';

function makeState(messages: AgentStateType['messages']): AgentStateType {
  return {
    messages,
    userId: 'user-1',
    sessionId: 'session-1',
    conversationId: 'conv-1',
    agentType: 'travel',
    memories: [],
    ragContext: null,
    taskListName: 'Travel Plans',
  };
}

describe('shouldContinue', () => {
  it('returns END when the last message is an AIMessage with no tool_calls', () => {
    const state = makeState([
      new HumanMessage('Plan a trip to Tokyo'),
      new AIMessage('Here is your itinerary!'),
    ]);

    expect(shouldContinue(state)).toBe(END);
  });

  it('returns "act" when the last message is an AIMessage with tool_calls', () => {
    const aiMsg = new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'web_search', args: { query: 'Tokyo hotels' }, type: 'tool_call' }] });
    const state = makeState([
      new HumanMessage('Find hotels in Tokyo'),
      aiMsg,
    ]);

    expect(shouldContinue(state)).toBe('act');
  });

  it('returns "act" when there are multiple tool_calls', () => {
    const aiMsg = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'call-1', name: 'web_search', args: { query: 'Tokyo hotels' }, type: 'tool_call' },
        { id: 'call-2', name: 'get_weather', args: { city: 'Tokyo' }, type: 'tool_call' },
      ],
    });
    const state = makeState([new HumanMessage('What is the weather?'), aiMsg]);

    expect(shouldContinue(state)).toBe('act');
  });

  it('returns END when the last message is a HumanMessage', () => {
    const state = makeState([new HumanMessage('Hello')]);

    expect(shouldContinue(state)).toBe(END);
  });

  it('returns END when the last message is a ToolMessage (act node just finished)', () => {
    const state = makeState([
      new HumanMessage('Search for flights'),
      new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'web_search', args: { query: 'flights' }, type: 'tool_call' }] }),
      new ToolMessage({ content: '{"results":[]}', tool_call_id: 'call-1' }),
    ]);

    // ToolMessage is the last — shouldContinue is only called after "reason" node, not after "act"
    // but just in case: it should return END since it's not an AIMessage with tool_calls
    expect(shouldContinue(state)).toBe(END);
  });

  it('returns END when messages array is empty', () => {
    const state = makeState([]);

    expect(shouldContinue(state)).toBe(END);
  });

  it('returns END when AIMessage has an empty tool_calls array', () => {
    const aiMsg = new AIMessage({ content: 'Done!', tool_calls: [] });
    const state = makeState([new HumanMessage('Hi'), aiMsg]);

    expect(shouldContinue(state)).toBe(END);
  });

  it('returns "act" when the last message is AIMessageChunk with tool_calls (streaming case)', () => {
    // LangChain streaming returns AIMessageChunk instead of AIMessage from model.invoke()
    const chunk = new AIMessageChunk({
      content: '',
      tool_calls: [{ id: 'call-1', name: 'convert_currency', args: { amount: 1000, from: 'USD', to: 'EUR' }, type: 'tool_call' }],
    });
    const state = makeState([new HumanMessage('Convert 1000 USD to EUR'), chunk]);

    expect(shouldContinue(state)).toBe('act');
  });

  it('returns END when AIMessageChunk has no tool_calls', () => {
    const chunk = new AIMessageChunk({ content: 'Paris is the capital of France.' });
    const state = makeState([new HumanMessage('Capital of France?'), chunk]);

    expect(shouldContinue(state)).toBe(END);
  });
});

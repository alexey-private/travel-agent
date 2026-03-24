import { WebSearchTool } from '@/tools/WebSearchTool';

// Must be mocked before WebSearchTool is imported (jest.mock is hoisted)
jest.mock('@/config/env', () => ({
  env: {
    TAVILY_API_KEY: 'test-tavily-key',
    OPENWEATHER_API_KEY: 'test-weather-key',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    PORT: 3001,
    NODE_ENV: 'test',
  },
}));

describe('WebSearchTool', () => {
  let tool: WebSearchTool;

  beforeEach(() => {
    tool = new WebSearchTool();
  });

  it('returns search results on a successful API response', async () => {
    const mockData = {
      results: [
        { title: 'Tokyo Travel Guide', url: 'https://example.com/tokyo', content: 'Tokyo is a vibrant city.' },
        { title: 'Visa Requirements', url: 'https://example.com/visa', content: 'Japan visa info.' },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await tool.execute({ query: 'Tokyo travel tips', max_results: 2 });

    expect(result.success).toBe(true);
    expect((result.data as { results: unknown[] }).results).toHaveLength(2);
    expect((result.data as { results: Array<{ title: string }> }).results[0].title).toBe('Tokyo Travel Guide');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.tavily.com/search');
    expect(JSON.parse(fetchCall[1].body)).toMatchObject({
      api_key: 'test-tavily-key',
      query: 'Tokyo travel tips',
      max_results: 2,
    });
  });

  it('returns an error on a non-200 API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    } as unknown as Response);

    const result = await tool.execute({ query: 'test query' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
    expect(result.error).toContain('Bad request');
  });

  it('returns an error on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

    const result = await tool.execute({ query: 'test query' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  it('defaults max_results to 5 when not provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    await tool.execute({ query: 'test' });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.max_results).toBe(5);
  });

  it('returns empty results array when API returns no results', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no results key
    } as Response);

    const result = await tool.execute({ query: 'obscure query' });

    expect(result.success).toBe(true);
    expect((result.data as { results: unknown[] }).results).toHaveLength(0);
  });

  it('exposes the correct tool definition', () => {
    const def = tool.toToolDefinition();
    expect(def.name).toBe('web_search');
    expect((def.inputSchema as { required: string[] }).required).toContain('query');
  });
});

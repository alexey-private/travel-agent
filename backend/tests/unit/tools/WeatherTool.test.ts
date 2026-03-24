import { WeatherTool } from '@/tools/WeatherTool';

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

/** Builds a minimal OpenWeatherMap forecast response for a given number of 3-hour slots. */
function buildForecastResponse(city: string, slots: number) {
  const list = Array.from({ length: slots }, (_, i) => ({
    dt_txt: `2024-04-0${Math.floor(i / 8) + 1} ${String((i % 8) * 3).padStart(2, '0')}:00:00`,
    main: { temp: 20 + i, temp_min: 18 + i, temp_max: 22 + i, humidity: 60 },
    weather: [{ description: 'partly cloudy' }],
  }));
  return { list, city: { name: city, country: 'JP' } };
}

describe('WeatherTool', () => {
  let tool: WeatherTool;

  beforeEach(() => {
    tool = new WeatherTool();
  });

  it('parses a forecast response correctly', async () => {
    const mockData = buildForecastResponse('Tokyo', 8); // 1 day (8 slots)

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as Response);

    const result = await tool.execute({ city: 'Tokyo', days: 1 });

    expect(result.success).toBe(true);
    const data = result.data as { city: string; country: string; forecast: unknown[] };
    expect(data.city).toBe('Tokyo');
    expect(data.country).toBe('JP');
    expect(data.forecast.length).toBeGreaterThan(0);

    const day = data.forecast[0] as {
      date: string;
      temp_avg: number;
      temp_min: number;
      temp_max: number;
      description: string;
      humidity: number;
    };
    expect(day.date).toBeDefined();
    expect(typeof day.temp_avg).toBe('number');
    expect(typeof day.temp_min).toBe('number');
    expect(typeof day.temp_max).toBe('number');
    expect(day.description).toBe('partly cloudy');
  });

  it('returns an error when the city is not found (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as unknown as Response);

    const result = await tool.execute({ city: 'NonExistentCityXYZ' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('NonExistentCityXYZ');
  });

  it('returns an error on other non-200 responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response);

    const result = await tool.execute({ city: 'Tokyo' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
    expect(result.error).toContain('Unauthorized');
  });

  it('returns an error on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));

    const result = await tool.execute({ city: 'Tokyo' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  it('includes the API key and city in the request URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildForecastResponse('Paris', 8),
    } as Response);

    await tool.execute({ city: 'Paris' });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('q=Paris');
    expect(url).toContain('appid=test-weather-key');
  });

  it('groups forecast items by date', async () => {
    // 2 days × 8 slots
    const mockData = buildForecastResponse('Berlin', 16);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as Response);

    const result = await tool.execute({ city: 'Berlin', days: 2 });

    const data = result.data as { forecast: unknown[] };
    // Should have at most 2 date groups
    expect(data.forecast.length).toBeLessThanOrEqual(2);
  });

  it('exposes the correct tool definition', () => {
    const def = tool.toToolDefinition();
    expect(def.name).toBe('get_weather');
    expect((def.inputSchema as { required: string[] }).required).toContain('city');
  });
});

import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { env } from '../config/env';

interface WeatherInput {
  city: string;
  days?: number;
}

interface ForecastItem {
  dt_txt: string;
  main: { temp: number; temp_min: number; temp_max: number; humidity: number };
  weather: Array<{ description: string }>;
}

export class WeatherTool extends BaseTool {
  readonly name = 'get_weather';
  readonly description = 'Get weather forecast for a city. Returns temperature and conditions for the next few days.';
  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name (e.g. "Tokyo", "Paris", "New York")',
      },
      days: {
        type: 'number',
        description: 'Number of days to forecast (1-5, default: 3)',
        minimum: 1,
        maximum: 5,
        default: 3,
      },
    },
    required: ['city'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { city, days = 3 } = input as WeatherInput;
    const cnt = Math.min(days, 5) * 8; // OpenWeatherMap returns 3h intervals

    try {
      const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${env.OPENWEATHER_API_KEY}&units=metric&cnt=${cnt}`;
      const response = await fetch(url);

      if (response.status === 404) {
        return { success: false, error: `City not found: ${city}` };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `OpenWeatherMap API error ${response.status}: ${errorText}` };
      }

      const data = await response.json() as { list: ForecastItem[]; city: { name: string; country: string } };

      // Group by date and aggregate
      const byDate = new Map<string, ForecastItem[]>();
      for (const item of data.list) {
        const date = item.dt_txt.split(' ')[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(item);
      }

      const forecast = Array.from(byDate.entries()).map(([date, items]) => {
        const temps = items.map((i) => i.main.temp);
        const humidities = items.map((i) => i.main.humidity);
        const midday = items[Math.floor(items.length / 2)];
        return {
          date,
          temp_min: Math.round(Math.min(...items.map((i) => i.main.temp_min))),
          temp_max: Math.round(Math.max(...items.map((i) => i.main.temp_max))),
          temp_avg: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length),
          description: midday.weather[0].description,
          humidity: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
        };
      });

      return {
        success: true,
        data: { city: data.city.name, country: data.city.country, forecast },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

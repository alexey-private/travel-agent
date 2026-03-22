import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';

interface CountryInfoInput {
  country: string;
}

interface RestCountry {
  name: { common: string; official: string };
  capital?: string[];
  region: string;
  subregion?: string;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string; symbol: string }>;
  timezones: string[];
  flag: string;
  population: number;
  continents: string[];
}

export class CountryInfoTool extends BaseTool {
  readonly name = 'get_country_info';
  readonly description =
    'Get country details: capital, official languages, currencies, timezones, region. ' +
    'Use this for questions about a country\'s currency, language, or basic geography.';
  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      country: {
        type: 'string',
        description: 'Country name (e.g. "Japan", "Brazil", "United Kingdom")',
      },
    },
    required: ['country'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { country } = input as CountryInfoInput;

    try {
      const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,region,subregion,languages,currencies,timezones,flag,population,continents`;
      const response = await fetch(url);

      if (response.status === 404) {
        return { success: false, error: `Country not found: ${country}` };
      }

      if (!response.ok) {
        return { success: false, error: `RestCountries API error ${response.status}` };
      }

      const data = (await response.json()) as RestCountry[];
      const c = data[0];

      const currencies = c.currencies
        ? Object.values(c.currencies).map((v) => `${v.name} (${v.symbol})`)
        : [];

      const languages = c.languages ? Object.values(c.languages) : [];

      return {
        success: true,
        data: {
          name: c.name.common,
          official_name: c.name.official,
          capital: c.capital?.[0] ?? null,
          region: c.region,
          subregion: c.subregion ?? null,
          continents: c.continents,
          languages,
          currencies,
          timezones: c.timezones,
          flag: c.flag,
          population: c.population,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const worldCountries: WorldCountry[] = require('world-countries');

interface CountryInfoInput {
  country: string;
}

interface WorldCountry {
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
  altSpellings: string[];
  cca2: string;
  cca3: string;
}

function findCountry(query: string): WorldCountry | undefined {
  const q = query.trim().toLowerCase();
  return worldCountries.find(
    (c) =>
      c.name.common.toLowerCase() === q ||
      c.name.official.toLowerCase() === q ||
      c.cca2.toLowerCase() === q ||
      c.cca3.toLowerCase() === q ||
      c.altSpellings.some((s) => s.toLowerCase() === q),
  );
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

    const c = findCountry(country);
    if (!c) {
      return { success: false, error: `Country not found: ${country}` };
    }

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
  }
}

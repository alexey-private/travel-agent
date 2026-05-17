import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';

interface CurrencyInput {
  amount: number;
  from: string;
  to: string;
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface OpenErApiResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc: string;
}

export class CurrencyTool extends BaseTool {
  readonly name = 'convert_currency';
  readonly description =
    'Convert an amount between currencies using live exchange rates (ECB data). ' +
    'Use this when the user asks how much something costs in their currency, or wants to budget in local currency.';
  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount to convert',
      },
      from: {
        type: 'string',
        description: 'Source currency ISO code (e.g. "USD", "EUR", "GBP")',
      },
      to: {
        type: 'string',
        description: 'Target currency ISO code (e.g. "JPY", "THB", "AUD")',
      },
    },
    required: ['amount', 'from', 'to'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { amount, from, to } = input as CurrencyInput;
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    try {
      const result = await this.tryFrankfurter(amount, fromUpper, toUpper)
        ?? await this.tryOpenErApi(amount, fromUpper, toUpper);

      if (!result) {
        return { success: false, error: 'All currency providers are unavailable. Please try again later.' };
      }

      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async tryFrankfurter(amount: number, from: string, to: string) {
    const response = await fetch(
      `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`
    );
    if (!response.ok) return null;

    const data = (await response.json()) as FrankfurterResponse;
    const converted = data.rates[to];
    if (converted === undefined) return null;

    return { from: data.base, to, amount: data.amount, converted, rate: converted / data.amount, date: data.date };
  }

  private async tryOpenErApi(amount: number, from: string, to: string) {
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (!response.ok) return null;

    const data = (await response.json()) as OpenErApiResponse;
    if (data.result !== 'success') return null;

    const rate = data.rates[to];
    if (rate === undefined) return null;

    const converted = Math.round(rate * amount * 10000) / 10000;
    const date = new Date(data.time_last_update_utc).toISOString().split('T')[0];

    return { from, to, amount, converted, rate, date };
  }
}

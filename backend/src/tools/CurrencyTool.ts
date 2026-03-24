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

    try {
      const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Frankfurter API error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as FrankfurterResponse;
      const converted = data.rates[to.toUpperCase()];

      if (converted === undefined) {
        return { success: false, error: `Unsupported currency code: ${to}` };
      }

      return {
        success: true,
        data: {
          from: data.base,
          to: to.toUpperCase(),
          amount: data.amount,
          converted,
          rate: converted / data.amount,
          date: data.date,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

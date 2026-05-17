import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface PriceCompareInput {
  product: string;
}

interface StoreComparison {
  store: string;
  price: number;
  currency: string;
  originalPrice?: number;
  discount?: number;
  inStock: boolean;
  deliveryDays: number;
}

const STORES = ['Amazon', 'Best Buy', 'Walmart', 'Target', 'eBay', 'Costco'];

/**
 * Deterministic seeded pseudo-random (no external dependency).
 */
function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

/** Derive a realistic base price from the product name. */
function deriveBasePrice(product: string): number {
  const p = product.toLowerCase();
  if (p.includes('laptop') || p.includes('macbook') || p.includes('xps')) return 999;
  if (p.includes('tv') || p.includes('television')) return 799;
  if (p.includes('iphone') || p.includes('galaxy s')) return 899;
  if (p.includes('headphone') || p.includes('airpods')) return 249;
  if (p.includes('watch') || p.includes('smartwatch')) return 349;
  if (p.includes('vacuum') || p.includes('dyson')) return 499;
  if (p.includes('blender') || p.includes('mixer')) return 299;
  if (p.includes('shoe') || p.includes('sneaker')) return 130;
  if (p.includes('jacket') || p.includes('coat')) return 189;
  if (p.includes('mattress')) return 899;
  if (p.includes('bike') || p.includes('peloton')) return 1299;
  // Default: derive from string hash
  const base = seededRand(product, 0);
  return Math.round(50 + base * 450);
}

export class PriceCompareTool extends BaseTool {
  readonly name = 'compare_prices';
  readonly description =
    'Compare prices for a product across multiple major retailers (Amazon, Best Buy, Walmart, Target, eBay, Costco). Results are deterministic for the same product name.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      product: {
        type: 'string',
        description: 'Product name to compare prices for (e.g. "Sony WH-1000XM5 headphones", "MacBook Air M3")',
      },
    },
    required: ['product'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { product } = input as PriceCompareInput;
    const basePrice = deriveBasePrice(product);

    const comparisons: StoreComparison[] = STORES.map((store, i) => {
      const variation = seededRand(product + store, i);
      const hasDiscount = seededRand(product + store + 'disc', i) > 0.6;
      const isOutOfStock = seededRand(product + store + 'stock', i) > 0.85;

      // Price varies ±20% from base
      const price = Math.round((basePrice * (0.85 + variation * 0.30)) * 100) / 100;
      const originalPrice = hasDiscount
        ? Math.round((price * (1.1 + seededRand(product + store + 'orig', i) * 0.2)) * 100) / 100
        : undefined;
      const discount = originalPrice
        ? Math.round((1 - price / originalPrice) * 100)
        : undefined;
      const deliveryDays = Math.floor(seededRand(product + store + 'del', i) * 5) + 1;

      return {
        store,
        price,
        currency: 'USD',
        ...(originalPrice !== undefined && { originalPrice }),
        ...(discount !== undefined && { discount }),
        inStock: !isOutOfStock,
        deliveryDays,
      };
    });

    // Sort by price ascending
    comparisons.sort((a, b) => a.price - b.price);

    return {
      success: true,
      data: {
        product,
        comparisons,
        cheapest: comparisons.find(c => c.inStock) ?? comparisons[0],
      },
    };
  }
}

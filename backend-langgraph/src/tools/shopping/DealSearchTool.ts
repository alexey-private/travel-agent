import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface DealSearchInput {
  category?: string;
  limit?: number;
}

interface Deal {
  product: string;
  brand: string;
  store: string;
  originalPrice: number;
  salePrice: number;
  discountPercent: number;
  currency: string;
  validUntil: string;
  category: string;
}

const DEALS: Deal[] = [
  { product: 'Sony WH-1000XM4 Headphones', brand: 'Sony', store: 'Amazon', originalPrice: 349.99, salePrice: 228.00, discountPercent: 35, currency: 'USD', validUntil: '2026-04-05', category: 'electronics' },
  { product: 'Samsung 55" 4K Smart TV', brand: 'Samsung', store: 'Best Buy', originalPrice: 799.99, salePrice: 499.99, discountPercent: 38, currency: 'USD', validUntil: '2026-04-02', category: 'electronics' },
  { product: 'iPad 10th Gen 64GB', brand: 'Apple', store: 'Walmart', originalPrice: 449.00, salePrice: 349.00, discountPercent: 22, currency: 'USD', validUntil: '2026-03-31', category: 'electronics' },
  { product: 'Bose QuietComfort 45', brand: 'Bose', store: 'Target', originalPrice: 329.00, salePrice: 199.00, discountPercent: 39, currency: 'USD', validUntil: '2026-04-07', category: 'electronics' },
  { product: 'Lenovo ThinkPad E15 Laptop', brand: 'Lenovo', store: 'Lenovo', originalPrice: 1099.00, salePrice: 699.00, discountPercent: 36, currency: 'USD', validUntil: '2026-04-10', category: 'electronics' },
  { product: 'Echo Dot (5th Gen)', brand: 'Amazon', store: 'Amazon', originalPrice: 49.99, salePrice: 22.99, discountPercent: 54, currency: 'USD', validUntil: '2026-04-01', category: 'electronics' },
  { product: 'Nike Air Zoom Pegasus 40', brand: 'Nike', store: 'Nike', originalPrice: 130.00, salePrice: 89.97, discountPercent: 31, currency: 'USD', validUntil: '2026-04-08', category: 'clothing' },
  { product: 'Columbia Men\'s Winter Jacket', brand: 'Columbia', store: 'REI', originalPrice: 180.00, salePrice: 108.00, discountPercent: 40, currency: 'USD', validUntil: '2026-04-03', category: 'clothing' },
  { product: 'Adidas Running Pants', brand: 'Adidas', store: 'Adidas', originalPrice: 70.00, salePrice: 42.00, discountPercent: 40, currency: 'USD', validUntil: '2026-04-06', category: 'clothing' },
  { product: 'Levi\'s 501 Original Jeans', brand: 'Levi\'s', store: 'Levi\'s', originalPrice: 79.50, salePrice: 49.99, discountPercent: 37, currency: 'USD', validUntil: '2026-04-09', category: 'clothing' },
  { product: 'Under Armour UA Tech T-Shirt', brand: 'Under Armour', store: 'Amazon', originalPrice: 30.00, salePrice: 17.99, discountPercent: 40, currency: 'USD', validUntil: '2026-04-04', category: 'clothing' },
  { product: 'Instant Pot Pro 10-in-1', brand: 'Instant Pot', store: 'Amazon', originalPrice: 149.99, salePrice: 89.95, discountPercent: 40, currency: 'USD', validUntil: '2026-04-05', category: 'home' },
  { product: 'Shark IQ Robot Vacuum', brand: 'Shark', store: 'Best Buy', originalPrice: 399.99, salePrice: 249.99, discountPercent: 38, currency: 'USD', validUntil: '2026-04-02', category: 'home' },
  { product: 'Ninja Foodi 12-in-1 Cooker', brand: 'Ninja', store: 'Target', originalPrice: 229.99, salePrice: 149.99, discountPercent: 35, currency: 'USD', validUntil: '2026-04-08', category: 'home' },
  { product: 'Cuisinart 14-Cup Coffee Maker', brand: 'Cuisinart', store: 'Walmart', originalPrice: 99.99, salePrice: 59.99, discountPercent: 40, currency: 'USD', validUntil: '2026-04-11', category: 'home' },
  { product: 'Tempur-Pedic Pillow', brand: 'Tempur-Pedic', store: 'Costco', originalPrice: 89.00, salePrice: 54.99, discountPercent: 38, currency: 'USD', validUntil: '2026-04-01', category: 'home' },
  { product: 'Fitbit Charge 6', brand: 'Fitbit', store: 'Best Buy', originalPrice: 159.95, salePrice: 99.95, discountPercent: 38, currency: 'USD', validUntil: '2026-04-07', category: 'sports' },
  { product: 'CamelBak Hydration Pack', brand: 'CamelBak', store: 'REI', originalPrice: 85.00, salePrice: 51.00, discountPercent: 40, currency: 'USD', validUntil: '2026-04-06', category: 'sports' },
  { product: 'Resistance Band Set (11-piece)', brand: 'Fit Simplify', store: 'Amazon', originalPrice: 29.99, salePrice: 17.97, discountPercent: 40, currency: 'USD', validUntil: '2026-04-09', category: 'sports' },
  { product: 'Hydro Flask 32oz Water Bottle', brand: 'Hydro Flask', store: 'REI', originalPrice: 49.95, salePrice: 32.47, discountPercent: 35, currency: 'USD', validUntil: '2026-04-04', category: 'sports' },
];

export class DealSearchTool extends BaseTool {
  readonly name = 'search_deals';
  readonly description =
    'Find current deals and discounts across product categories. Returns products with the biggest price reductions right now.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['electronics', 'clothing', 'home', 'sports'],
        description: 'Optional category filter to narrow deals',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of deals to return (default 5, max 10)',
      },
    },
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { category, limit = 5 } = (input ?? {}) as DealSearchInput;
    const count = Math.min(limit, 10);

    let deals = category
      ? DEALS.filter(d => d.category === category)
      : DEALS;

    // Sort by discount percent descending
    deals = deals.slice().sort((a, b) => b.discountPercent - a.discountPercent);
    deals = deals.slice(0, count);

    return {
      success: true,
      data: { deals },
    };
  }
}

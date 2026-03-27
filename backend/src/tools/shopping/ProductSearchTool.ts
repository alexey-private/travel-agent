import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface ProductSearchInput {
  query: string;
  category?: string;
  maxResults?: number;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  currency: string;
  store: string;
  url: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  category: string;
}

const CATALOG: Product[] = [
  // Electronics — Headphones (premium)
  { id: 'e1', name: 'Sony WH-1000XM5 Headphones', brand: 'Sony', price: 349.99, currency: 'USD', store: 'Best Buy', url: 'https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p', rating: 4.8, reviewCount: 12450, inStock: true, category: 'electronics' },
  { id: 'e2', name: 'Apple AirPods Pro (2nd Gen)', brand: 'Apple', price: 249.00, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B0CHWRXH8B', rating: 4.7, reviewCount: 32100, inStock: true, category: 'electronics' },
  // Electronics — Headphones (under $200, noise-cancelling)
  { id: 'e13', name: 'Sony WH-CH720N Noise Cancelling Headphones', brand: 'Sony', price: 99.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B0BVM9YBFN', rating: 4.5, reviewCount: 8720, inStock: true, category: 'electronics' },
  { id: 'e14', name: 'Anker Soundcore Q45 Noise Cancelling Headphones', brand: 'Anker', price: 79.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B09SNFR4XW', rating: 4.4, reviewCount: 14300, inStock: true, category: 'electronics' },
  { id: 'e15', name: 'JBL Tune 760NC Noise Cancelling Headphones', brand: 'JBL', price: 99.95, currency: 'USD', store: 'Best Buy', url: 'https://www.bestbuy.com/site/jbl-tune-760nc/6501304.p', rating: 4.4, reviewCount: 9100, inStock: true, category: 'electronics' },
  { id: 'e16', name: 'Beats Studio3 Noise Cancelling Headphones', brand: 'Beats', price: 179.95, currency: 'USD', store: 'Target', url: 'https://www.target.com/p/beats-studio3/-/A-77957687', rating: 4.5, reviewCount: 11200, inStock: true, category: 'electronics' },
  { id: 'e17', name: 'Jabra Evolve2 55 Noise Cancelling Headphones', brand: 'Jabra', price: 149.00, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B09B1Q4KXG', rating: 4.3, reviewCount: 4600, inStock: true, category: 'electronics' },
  { id: 'e18', name: 'Bose QuietComfort 45 Noise Cancelling Headphones', brand: 'Bose', price: 199.00, currency: 'USD', store: 'Best Buy', url: 'https://www.bestbuy.com/site/bose-quietcomfort-45/6483562.p', rating: 4.7, reviewCount: 18900, inStock: true, category: 'electronics' },
  // Electronics — Other
  { id: 'e3', name: 'Samsung 65" QLED 4K TV', brand: 'Samsung', price: 1299.99, currency: 'USD', store: 'Best Buy', url: 'https://www.bestbuy.com/site/samsung-65-qled/6401787.p', rating: 4.6, reviewCount: 5840, inStock: true, category: 'electronics' },
  { id: 'e4', name: 'Dell XPS 15 Laptop', brand: 'Dell', price: 1799.99, currency: 'USD', store: 'Dell', url: 'https://www.dell.com/en-us/shop/dell-laptops/xps-15/spd/xps-15-9530-laptop', rating: 4.5, reviewCount: 3210, inStock: true, category: 'electronics' },
  { id: 'e5', name: 'MacBook Air M3', brand: 'Apple', price: 1099.00, currency: 'USD', store: 'Apple', url: 'https://www.apple.com/shop/buy-mac/macbook-air/13-inch-m3', rating: 4.9, reviewCount: 8900, inStock: true, category: 'electronics' },
  { id: 'e6', name: 'iPhone 15 Pro', brand: 'Apple', price: 999.00, currency: 'USD', store: 'Apple', url: 'https://www.apple.com/shop/buy-iphone/iphone-15-pro', rating: 4.8, reviewCount: 45200, inStock: true, category: 'electronics' },
  { id: 'e7', name: 'Samsung Galaxy S24', brand: 'Samsung', price: 799.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B0CMDWC436', rating: 4.6, reviewCount: 18700, inStock: true, category: 'electronics' },
  { id: 'e8', name: 'Logitech MX Master 3 Mouse', brand: 'Logitech', price: 99.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B07S395RWD', rating: 4.7, reviewCount: 22000, inStock: true, category: 'electronics' },
  // Clothing
  { id: 'c1', name: 'Nike Air Max 270 Running Shoes', brand: 'Nike', price: 150.00, currency: 'USD', store: 'Nike', url: 'https://www.nike.com/t/air-max-270-shoes', rating: 4.5, reviewCount: 9800, inStock: true, category: 'clothing' },
  { id: 'c2', name: 'Adidas Ultraboost 23 Shoes', brand: 'Adidas', price: 190.00, currency: 'USD', store: 'Adidas', url: 'https://www.adidas.com/us/ultraboost-23-shoes', rating: 4.6, reviewCount: 7600, inStock: true, category: 'clothing' },
  { id: 'c3', name: 'Patagonia Down Sweater Jacket', brand: 'Patagonia', price: 229.00, currency: 'USD', store: 'REI', url: 'https://www.rei.com/product/patagonia-down-sweater', rating: 4.8, reviewCount: 4300, inStock: true, category: 'clothing' },
  { id: 'c4', name: 'Levi\'s 511 Slim Jeans', brand: 'Levi\'s', price: 69.50, currency: 'USD', store: 'Levi\'s', url: 'https://www.levi.com/US/en_US/clothing/men/jeans/511-slim-fit-jeans', rating: 4.4, reviewCount: 15600, inStock: true, category: 'clothing' },
  { id: 'c5', name: 'The North Face Thermoball Jacket', brand: 'The North Face', price: 199.00, currency: 'USD', store: 'REI', url: 'https://www.rei.com/product/the-north-face-thermoball-eco-jacket', rating: 4.7, reviewCount: 5200, inStock: false, category: 'clothing' },
  // Home
  { id: 'h1', name: 'Instant Pot Duo 7-in-1', brand: 'Instant Pot', price: 89.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B00FLYWNYQ', rating: 4.7, reviewCount: 87000, inStock: true, category: 'home' },
  { id: 'h2', name: 'Dyson V15 Detect Vacuum', brand: 'Dyson', price: 749.99, currency: 'USD', store: 'Dyson', url: 'https://www.dyson.com/vacuum-cleaners/cordless/v15/detect', rating: 4.8, reviewCount: 11200, inStock: true, category: 'home' },
  { id: 'h3', name: 'Vitamix 5200 Blender', brand: 'Vitamix', price: 449.95, currency: 'USD', store: 'Williams-Sonoma', url: 'https://www.williams-sonoma.com/products/vitamix-5200', rating: 4.9, reviewCount: 6700, inStock: true, category: 'home' },
  { id: 'h4', name: 'Casper Original Mattress Queen', brand: 'Casper', price: 1095.00, currency: 'USD', store: 'Casper', url: 'https://casper.com/mattresses/casper-original', rating: 4.5, reviewCount: 9800, inStock: true, category: 'home' },
  { id: 'h5', name: 'KitchenAid Stand Mixer', brand: 'KitchenAid', price: 379.99, currency: 'USD', store: 'Target', url: 'https://www.target.com/p/kitchenaid-stand-mixer/-/A-14736529', rating: 4.8, reviewCount: 32000, inStock: true, category: 'home' },
  // Sports
  { id: 's1', name: 'Peloton Bike+', brand: 'Peloton', price: 2495.00, currency: 'USD', store: 'Peloton', url: 'https://www.onepeloton.com/bikes/bike-plus', rating: 4.6, reviewCount: 18400, inStock: true, category: 'sports' },
  { id: 's2', name: 'Garmin Fenix 7 GPS Watch', brand: 'Garmin', price: 699.99, currency: 'USD', store: 'REI', url: 'https://www.rei.com/product/garmin-fenix-7', rating: 4.7, reviewCount: 8900, inStock: true, category: 'sports' },
  { id: 's3', name: 'Yeti Rambler 30oz Tumbler', brand: 'Yeti', price: 38.00, currency: 'USD', store: 'REI', url: 'https://www.rei.com/product/yeti-rambler-30-oz-tumbler', rating: 4.8, reviewCount: 21000, inStock: true, category: 'sports' },
  { id: 's4', name: 'TRX All-in-One Suspension Trainer', brand: 'TRX', price: 199.95, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B008MN591K', rating: 4.6, reviewCount: 14500, inStock: true, category: 'sports' },
  { id: 's5', name: 'Bowflex SelectTech 552 Dumbbells', brand: 'Bowflex', price: 379.00, currency: 'USD', store: 'Best Buy', url: 'https://www.bestbuy.com/site/bowflex-selecttech-552/6422485.p', rating: 4.7, reviewCount: 9200, inStock: false, category: 'sports' },
  // Budget laptops
  { id: 'e9', name: 'Acer Aspire 5 Laptop', brand: 'Acer', price: 549.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B09SNHB7B2', rating: 4.3, reviewCount: 6700, inStock: true, category: 'electronics' },
  { id: 'e10', name: 'Lenovo IdeaPad 3 Laptop', brand: 'Lenovo', price: 649.99, currency: 'USD', store: 'Walmart', url: 'https://www.walmart.com/ip/Lenovo-IdeaPad-3/1234567890', rating: 4.2, reviewCount: 4800, inStock: true, category: 'electronics' },
  { id: 'e11', name: 'HP Pavilion 15 Laptop', brand: 'HP', price: 699.99, currency: 'USD', store: 'Best Buy', url: 'https://www.bestbuy.com/site/hp-pavilion-15/6501234.p', rating: 4.3, reviewCount: 5100, inStock: true, category: 'electronics' },
  { id: 'e12', name: 'Asus ZenBook 14 Laptop', brand: 'Asus', price: 849.99, currency: 'USD', store: 'Amazon', url: 'https://www.amazon.com/dp/B0CHN7M5GT', rating: 4.5, reviewCount: 3900, inStock: true, category: 'electronics' },
];

export class ProductSearchTool extends BaseTool {
  readonly name = 'search_products';
  readonly description =
    'Search for products by name, brand, or category. Returns a list of matching products with prices, ratings, and store availability.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — product name, brand, or description (e.g. "Sony headphones", "running shoes")',
      },
      category: {
        type: 'string',
        enum: ['electronics', 'clothing', 'home', 'sports'],
        description: 'Optional category filter',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default 5, max 10)',
      },
    },
    required: ['query'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { query, category, maxResults = 5 } = input as ProductSearchInput;
    const limit = Math.min(maxResults, 10);
    const q = query.toLowerCase();

    let results = CATALOG.filter(p => {
      const matchesQuery =
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      const matchesCategory = !category || p.category === category;
      return matchesQuery && matchesCategory;
    });

    // If no direct match, try individual words
    if (results.length === 0) {
      const words = q.split(/\s+/).filter(w => w.length > 2);
      results = CATALOG.filter(p => {
        const text = `${p.name} ${p.brand} ${p.category}`.toLowerCase();
        const matchesQuery = words.some(w => text.includes(w));
        const matchesCategory = !category || p.category === category;
        return matchesQuery && matchesCategory;
      });
    }

    const products = results.slice(0, limit).map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      price: p.price,
      currency: p.currency,
      store: p.store,
      url: p.url,
      rating: p.rating,
      reviewCount: p.reviewCount,
      inStock: p.inStock,
      category: p.category,
    }));

    if (products.length === 0) {
      return {
        success: true,
        data: {
          products: [],
          message: `No products found for "${query}". Try a broader search term or different category.`,
        },
      };
    }

    return { success: true, data: { products } };
  }
}

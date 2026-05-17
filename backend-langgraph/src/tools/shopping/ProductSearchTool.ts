import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { RAGService } from '../../services/RAGService';

interface ProductSearchInput {
  query: string;
  category?: string;
  maxPrice?: number;
  maxResults?: number;
}

export class ProductSearchTool extends BaseTool {
  readonly name = 'search_products';
  readonly description =
    'Search for products by name, brand, features, or description using semantic search over the product catalog. ' +
    'Returns matching products with prices, ratings, store availability, and purchase URLs. ' +
    'Use natural language queries like "noise-cancelling headphones under $200" or "lightweight laptop for travel".';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language product search query (e.g. "best noise-cancelling headphones", "lightweight running shoes")',
      },
      category: {
        type: 'string',
        enum: ['electronics', 'clothing', 'home', 'sports'],
        description: 'Optional category filter to narrow results',
      },
      maxPrice: {
        type: 'number',
        description: 'Optional maximum price in USD to filter results',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default 5, max 10)',
      },
    },
    required: ['query'],
  };

  constructor(private ragService: RAGService) {
    super();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const { query, category, maxPrice, maxResults = 5 } = input as ProductSearchInput;
    const limit = Math.min(maxResults, 10);

    // Build metadata filter: always restrict to product documents;
    // add category constraint when provided.
    const filter: Record<string, unknown> = { type: 'product' };
    if (category) filter.category = category;

    const chunks = await this.ragService.retrieve(query, limit * 2, filter);

    if (chunks.length === 0) {
      return {
        success: true,
        data: {
          products: [],
          message: `No products found in catalog for "${query}". Consider using web_search for broader results.`,
        },
      };
    }

    // Parse each KB chunk into a structured product record.
    // Metadata carries the structured fields; content provides the full description.
    let products = chunks.map(chunk => {
      const m = chunk.metadata ?? {};
      // Extract product name from topic by removing the " — product" suffix
      const name = chunk.topic.replace(/ —\s*product$/i, '');
      return {
        name,
        brand: m.brand as string ?? '',
        price: m.price as number ?? 0,
        currency: 'USD',
        store: m.store as string ?? '',
        url: m.url as string ?? '',
        inStock: m.inStock as boolean ?? false,
        category: m.category as string ?? '',
        subcategory: m.subcategory as string ?? '',
        description: extractKeyFeatures(chunk.content),
        relevanceScore: Math.round(chunk.similarity * 100) / 100,
      };
    });

    // Apply price filter if requested
    if (maxPrice !== undefined) {
      products = products.filter(p => p.price <= maxPrice);
    }

    products = products.slice(0, limit);

    if (products.length === 0) {
      return {
        success: true,
        data: {
          products: [],
          message: `No products found under $${maxPrice} for "${query}". Consider raising the budget or using web_search.`,
        },
      };
    }

    return { success: true, data: { products } };
  }
}

/**
 * Extracts the "Key Features" section from a product KB document,
 * returning the bullet list as a compact string for LLM consumption.
 * Falls back to the first 400 characters when the section is not found.
 */
function extractKeyFeatures(content: string): string {
  const match = content.match(/Key Features:\n([\s\S]*?)(?:\n\nTechnical Specifications:|$)/);
  if (match) {
    return match[1].trim().slice(0, 600);
  }
  return content.slice(0, 400);
}

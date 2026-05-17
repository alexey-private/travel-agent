import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';
import { RAGService } from '../../services/RAGService';

interface ProductReviewsInput {
  product: string;
}

export class ProductReviewsTool extends BaseTool {
  readonly name = 'get_product_reviews';
  readonly description =
    'Get customer reviews, expert analysis, pros/cons, and rating summary for a product. ' +
    'Uses semantic search to find review documents even with partial or approximate product names.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      product: {
        type: 'string',
        description: 'Product name to get reviews for (e.g. "Sony WH-1000XM5", "MacBook Air M3")',
      },
    },
    required: ['product'],
  };

  constructor(private ragService: RAGService) {
    super();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const { product } = input as ProductReviewsInput;

    const chunks = await this.ragService.retrieve(
      product,
      3,
      { type: 'reviews' },
    );

    if (chunks.length === 0) {
      return {
        success: true,
        data: {
          product,
          message: `No reviews found in catalog for "${product}". Consider using web_search for expert reviews.`,
        },
      };
    }

    // Return the best-matching review document as structured data.
    const best = chunks[0];
    const m = best.metadata ?? {};

    return {
      success: true,
      data: {
        product: best.topic.replace(/ —\s*reviews$/i, ''),
        avgRating: m.avgRating as number ?? null,
        reviewCount: m.reviewCount as number ?? null,
        relevanceScore: Math.round(best.similarity * 100) / 100,
        reviewContent: best.content,
        // Surface additional close matches so the LLM can mention alternatives
        relatedReviews: chunks.slice(1).map(c => ({
          product: c.topic.replace(/ —\s*reviews$/i, ''),
          avgRating: (c.metadata?.avgRating as number) ?? null,
          relevanceScore: Math.round(c.similarity * 100) / 100,
        })),
      },
    };
  }
}

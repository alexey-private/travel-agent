import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface ProductReviewsInput {
  product: string;
  limit?: number;
}

interface Review {
  rating: number;
  title: string;
  body: string;
  helpful: number;
  verified: boolean;
}

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

const REVIEW_POOL: Review[] = [
  { rating: 5, title: 'Absolutely love it!', body: 'This product exceeded all my expectations. The build quality is exceptional and it works exactly as advertised. Highly recommend to anyone considering it.', helpful: 342, verified: true },
  { rating: 5, title: 'Best purchase I\'ve made all year', body: 'I was skeptical at first but this has completely won me over. Setup was easy and the performance is outstanding. Worth every penny.', helpful: 218, verified: true },
  { rating: 5, title: 'Outstanding quality', body: 'The premium materials and craftsmanship are immediately apparent. It\'s clear a lot of thought went into the design. Already recommending it to friends.', helpful: 189, verified: false },
  { rating: 4, title: 'Great product, minor issues', body: 'Overall very happy with this purchase. The main features work flawlessly. Took off one star because the packaging could be better, but the product itself is excellent.', helpful: 156, verified: true },
  { rating: 4, title: 'Solid choice, does what it says', body: 'Does exactly what it\'s supposed to do, and does it well. Nothing groundbreaking but a reliable, quality option in this category. Good value for the price.', helpful: 134, verified: true },
  { rating: 4, title: 'Happy with my purchase', body: 'Really enjoying using this. A few small quirks to get used to but nothing deal-breaking. Customer support was helpful when I had a question during setup.', helpful: 98, verified: true },
  { rating: 3, title: 'Decent but not perfect', body: 'It\'s a decent product that does the job. I have some minor complaints about the interface and initial setup, but once you figure it out, it works fine.', helpful: 87, verified: true },
  { rating: 3, title: 'Mixed feelings', body: 'Some things are great, others are disappointing. The core functionality is good but there are some usability issues that should have been ironed out before release.', helpful: 72, verified: false },
  { rating: 2, title: 'Had higher expectations', body: 'The marketing overpromises. While it\'s not terrible, I expected more for the price point. Might work well for casual use but not for what I needed it for.', helpful: 65, verified: true },
  { rating: 5, title: 'Game changer for me', body: 'I\'ve tried many products in this category and this one stands out. The attention to detail is impressive and it has genuinely improved my daily routine.', helpful: 203, verified: true },
  { rating: 4, title: 'Very pleased overall', body: 'Bought this after reading the reviews and I\'m glad I did. Performance is excellent and it feels very well made. The price is fair for what you get.', helpful: 144, verified: true },
  { rating: 5, title: 'Surpassed expectations', body: 'I bought this as a gift and the recipient absolutely loved it. The quality is visible from the moment you open the box. Would definitely buy again.', helpful: 176, verified: true },
  { rating: 3, title: 'Okay for the price', body: 'If you\'re on a budget this is fine. Don\'t expect top-tier performance but for everyday use it handles things adequately. Probably won\'t repurchase.', helpful: 53, verified: true },
  { rating: 5, title: 'Highly recommend', body: 'Simply the best in its category. I\'ve owned a few similar products before and this one outperforms them all. The quality justifies the price completely.', helpful: 291, verified: false },
  { rating: 4, title: 'Good investment', body: 'A well-thought-out product that clearly had a lot of user feedback incorporated into its design. A few things I\'d improve, but overall a strong buy.', helpful: 119, verified: true },
  { rating: 2, title: 'Not for everyone', body: 'Works as described but the learning curve is steep and the manual is unhelpful. After weeks of use I\'m still not fully comfortable with it.', helpful: 44, verified: true },
  { rating: 5, title: 'Perfect!', body: 'Exactly what I needed. Arrived quickly, was easy to set up, and has worked perfectly since day one. No complaints whatsoever.', helpful: 267, verified: true },
  { rating: 4, title: 'Impressed with the quality', body: 'The materials feel premium and the fit and finish are excellent. It\'s clearly a step above cheaper alternatives in build quality and reliability.', helpful: 132, verified: true },
  { rating: 3, title: 'Decent, but competition is strong', body: 'A solid product that does its job, but given how competitive this space is, I expected a bit more to stand out. Functional but not particularly exciting.', helpful: 61, verified: true },
  { rating: 5, title: 'Couldn\'t be happier', body: 'This has quickly become one of my favorite purchases. The design is elegant, performance is top-notch, and it has held up great with daily use.', helpful: 198, verified: true },
];

const PROS_POOL = [
  'Excellent build quality',
  'Great value for the price',
  'Easy to set up and use',
  'Long battery life',
  'Fast and responsive performance',
  'Stylish and modern design',
  'Reliable and consistent results',
  'Great customer support',
  'Works as advertised',
  'Comfortable for extended use',
];

const CONS_POOL = [
  'Packaging could be improved',
  'Learning curve for new users',
  'Could use more accessories in the box',
  'Occasional software quirks',
  'Price is on the higher end',
  'Manual is not very detailed',
  'Limited color options',
  'Slightly bulky',
];

export class ProductReviewsTool extends BaseTool {
  readonly name = 'get_product_reviews';
  readonly description =
    'Get customer reviews, average rating, pros and cons for a product. Results are deterministic for the same product name.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      product: {
        type: 'string',
        description: 'Product name to get reviews for (e.g. "Sony WH-1000XM5", "MacBook Air M3")',
      },
      limit: {
        type: 'number',
        description: 'Number of individual reviews to return (default 3, max 5)',
      },
    },
    required: ['product'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { product, limit = 3 } = input as ProductReviewsInput;
    const count = Math.min(limit, 5);

    // Pick reviews deterministically
    const reviewIndices = new Set<number>();
    let offset = 0;
    while (reviewIndices.size < count) {
      const idx = Math.floor(seededRand(product, offset) * REVIEW_POOL.length);
      reviewIndices.add(idx);
      offset++;
    }
    const reviews = [...reviewIndices].map(i => REVIEW_POOL[i]);

    // Compute a plausible average rating
    const baseRating = 3.5 + seededRand(product, 99) * 1.4;
    const averageRating = Math.round(baseRating * 10) / 10;
    const totalReviews = Math.floor(1000 + seededRand(product, 100) * 49000);

    // Pick pros and cons deterministically
    const numPros = 3 + Math.floor(seededRand(product, 200) * 2);
    const numCons = 2 + Math.floor(seededRand(product, 201) * 2);

    const pros: string[] = [];
    for (let i = 0; i < numPros; i++) {
      const idx = Math.floor(seededRand(product, 300 + i) * PROS_POOL.length);
      if (!pros.includes(PROS_POOL[idx])) pros.push(PROS_POOL[idx]);
    }

    const cons: string[] = [];
    for (let i = 0; i < numCons; i++) {
      const idx = Math.floor(seededRand(product, 400 + i) * CONS_POOL.length);
      if (!cons.includes(CONS_POOL[idx])) cons.push(CONS_POOL[idx]);
    }

    return {
      success: true,
      data: {
        product,
        averageRating,
        totalReviews,
        pros,
        cons,
        reviews,
      },
    };
  }
}

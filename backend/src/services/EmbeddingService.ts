/** Dimension used in the knowledge_base schema (matches voyage-3-lite native output). */
const EMBEDDING_DIM = 512;

/** Voyage AI REST endpoint for embeddings. */
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Service responsible for converting text into embedding vectors.
 *
 * Priority:
 * 1. Voyage AI (voyage-3-lite model) — if VOYAGE_API_KEY is set in env
 * 2. Random unit vector — dev/test fallback when no API key is available
 *
 * The random fallback intentionally produces non-meaningful embeddings
 * so that similarity search can still be exercised locally without credentials.
 */
export class EmbeddingService {
  private readonly voyageApiKey: string | undefined;

  constructor() {
    this.voyageApiKey = process.env.VOYAGE_API_KEY;
  }

  /**
   * Embeds the given text and returns a 1536-dimensional float array.
   */
  async embed(text: string): Promise<number[]> {
    if (this.voyageApiKey) {
      return this.embedWithVoyage(text);
    }
    return this.randomVector();
  }

  private async embedWithVoyage(text: string, attempt = 0): Promise<number[]> {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.voyageApiKey}`,
      },
      body: JSON.stringify({
        model: 'voyage-3-lite',
        input: [text],
      }),
    });

    if (response.status === 429 && attempt < 4) {
      const delay = 2000 * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.embedWithVoyage(text, attempt + 1);
    }

    if (!response.ok) {
      throw new Error(`Voyage AI API error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return json.data[0].embedding;
  }

  /**
   * Returns a random unit vector of EMBEDDING_DIM dimensions.
   * Used as a no-op fallback in development when VOYAGE_API_KEY is absent.
   */
  private randomVector(): number[] {
    const raw = Array.from({ length: EMBEDDING_DIM }, () => Math.random() * 2 - 1);
    const norm = Math.sqrt(raw.reduce((acc, v) => acc + v * v, 0));
    return raw.map(v => v / norm);
  }
}

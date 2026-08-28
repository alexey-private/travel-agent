/**
 * Minimal type declarations for bidi-js@1.0.3, which ships none of its own.
 *
 * Only the two entry points we use are declared. The package's sole export is a
 * factory that has to be invoked before any method exists.
 */
declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }

  interface Bidi {
    /**
     * Resolves the bidirectional embedding level of every character.
     *
     * `explicitDirection` sets the paragraph direction outright. Without it the
     * direction is inferred from the first strongly-directional character, which
     * is wrong for a Hebrew paragraph that happens to open with a flight number.
     */
    getEmbeddingLevels(text: string, explicitDirection?: 'ltr' | 'rtl'): EmbeddingLevels;

    /** Reorders into visual order and substitutes mirrored characters. */
    getReorderedString(text: string, levels: EmbeddingLevels, start?: number, end?: number): string;
  }

  export default function bidiFactory(): Bidi;
}

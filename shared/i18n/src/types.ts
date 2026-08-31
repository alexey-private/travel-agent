/**
 * Plural forms of one dictionary entry.
 *
 * `other` is mandatory and doubles as the fallback: Russian needs `few` and
 * `many`, Hebrew and English do not, so every form except `other` is optional.
 */
export interface PluralForms {
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Entry = string | PluralForms;

export type TVars = Record<string, string | number>;

/**
 * The shape `translate` can read. Each package keeps its own dictionaries and
 * infers its own key union from them; this is only the lower bound they satisfy.
 */
export type Dict = Record<string, Entry>;

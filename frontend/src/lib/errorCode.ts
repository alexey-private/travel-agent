import { en } from "@/i18n/locales/en";
import type { TKey } from "@/i18n/dictionaries";

/**
 * Turns the backend's `code` on an error response into a dictionary key.
 *
 * The backend names failures in snake_case (`drive_not_configured`); dictionary
 * keys are `namespace.camelCase`, so the code is converted rather than used
 * verbatim. A code with no entry falls back to the caller's generic key: an
 * unknown code then reads as "Export failed" rather than as the raw key, which
 * is what a user would otherwise see on screen.
 */
export function errorKeyFor(code: string | undefined, fallback: TKey): TKey {
  if (!code) return fallback;
  const camel = code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const key = `errors.${camel}`;
  return key in en ? (key as TKey) : fallback;
}

/** Reads the `code` off a failed response body, tolerating a non-JSON body. */
export async function errorKeyOf(response: Response, fallback: TKey): Promise<TKey> {
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return errorKeyFor(body.code, fallback);
}

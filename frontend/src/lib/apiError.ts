import type { TKey } from "@/i18n/dictionaries";

/**
 * A failed API call, carrying a translation key rather than English prose.
 *
 * `message` is the bare key so that any surface showing the error can run it
 * through `t()` — `translate()` returns the key unchanged if it is missing, so
 * a forgotten entry degrades to something greppable instead of a blank string.
 * The HTTP status stays on the instance for logging and for tests, where it is
 * the only way to tell one failure mode from another.
 */
export class ApiError extends Error {
  readonly key: TKey;
  readonly status: number;

  constructor(key: TKey, status: number) {
    super(key);
    this.name = "ApiError";
    this.key = key;
    this.status = status;
  }
}

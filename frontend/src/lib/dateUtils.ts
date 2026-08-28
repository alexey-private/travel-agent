import type { Locale } from "@/i18n/config";

/**
 * Formats a message timestamp the way a chat list does: time today, "yesterday"
 * yesterday, a weekday name inside the week, month and day beyond that.
 *
 * The locale is passed in rather than read from the browser: the interface
 * language and the browser language are different things, and a user reading
 * Hebrew should not get English weekday names.
 *
 * `now` is injectable so the relative branches are testable.
 */
export function formatDate(iso: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  if (diffDays === 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
  }

  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

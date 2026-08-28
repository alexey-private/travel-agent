import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { LANG_COOKIE, type Locale } from "@/i18n/config";

/**
 * Renders a component inside the language provider.
 *
 * Every component test uses this instead of bare `render` — components read
 * their copy through useT(), which throws outside the provider.
 *
 * The cookie is set to match, because that is what a browser showing this
 * locale would have. Without it the provider treats the locale as an unverified
 * guess and re-derives it from the environment, which in jsdom means en-US —
 * so a component asked for in Hebrew would quietly render in English.
 */
export function renderWithI18n(
  ui: ReactElement,
  locale: Locale = "en",
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  document.cookie = `${LANG_COOKIE}=${locale}; path=/`;
  return render(ui, {
    wrapper: ({ children }) => <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>,
    ...options,
  });
}

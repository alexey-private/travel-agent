import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import type { Locale } from "@/i18n/config";

/**
 * Renders a component inside the language provider.
 *
 * Every component test uses this instead of bare `render` — components read
 * their copy through useT(), which throws outside the provider.
 */
export function renderWithI18n(
  ui: ReactElement,
  locale: Locale = "en",
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>,
    ...options,
  });
}

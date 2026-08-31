import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useLocale } from "@/i18n/useT";
import type { Locale } from "@travel-agent/i18n";
import { captureCookieWrites } from "./captureCookieWrites";

function Switcher({ to }: { to: Locale }) {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale(to)}>switch</button>;
}

/**
 * Switches the language and hands back the raw `document.cookie` write it
 * produced, attributes included.
 *
 * The `Secure` flag is decided from the page's protocol, and a jsdom
 * environment's URL is fixed per file — so the two halves of that rule have to
 * live in two files, and this is the body they would otherwise both repeat.
 */
export async function cookieWrittenWhenSwitchingTo(to: Locale): Promise<string | undefined> {
  const { writes, restore } = captureCookieWrites();
  try {
    render(
      <LanguageProvider initialLocale="en">
        <Switcher to={to} />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /switch/i }));
    return writes.find((write) => write.startsWith(`lang=${to}`));
  } finally {
    restore();
  }
}

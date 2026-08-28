import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { DEFAULT_LOCALE, LANG_COOKIE, dirOf, isLocale } from "@/i18n/config";
import { acceptLanguageLocale } from "@/i18n/detectLocale";

export const metadata: Metadata = {
  title: "Travel Planning Agent",
  description: "AI-powered travel planning assistant with ReAct reasoning",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading the cookie here — rather than in a client effect — is what keeps
  // Hebrew from rendering left-to-right for one frame before hydration.
  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value;
  const chosen = isLocale(raw) ? raw : null;

  // Nobody has chosen a language yet: Accept-Language is the only reading of
  // the visitor's own preference that arrives in time for the first paint.
  // headers() adds no cost — cookies() above already made this render dynamic.
  const fromHeader = chosen ? null : acceptLanguageLocale((await headers()).get("accept-language"));
  const locale = chosen ?? fromHeader ?? DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="antialiased">
        {/* fromHeader is passed on its own: the provider must be able to tell a
            request that asked for English from one that asked for nothing. */}
        <LanguageProvider initialLocale={locale} headerLocale={fromHeader}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}

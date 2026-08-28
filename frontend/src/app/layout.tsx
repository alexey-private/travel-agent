import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { LANG_COOKIE, dirOf, isLocale } from "@/i18n/config";
import { headerLocale } from "@/i18n/detectLocale";

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
  // Nobody has chosen a language yet: Accept-Language is the only reading of
  // the visitor's own preference that arrives in time for the first paint.
  // headers() adds no cost — cookies() above already made this render dynamic.
  const locale = isLocale(raw) ? raw : headerLocale((await headers()).get("accept-language"));

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="antialiased">
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}

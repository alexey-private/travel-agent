"use client";

import { useContext } from "react";
import { LanguageContext, type LanguageContextValue } from "./LanguageProvider";

function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <LanguageProvider>");
  return ctx;
}

/** Returns the translation function for the current locale. */
export function useT(): LanguageContextValue["t"] {
  return useLanguageContext().t;
}

/** Returns the current locale, the setter, and the writing direction. */
export function useLocale(): Omit<LanguageContextValue, "t"> {
  const { locale, setLocale, dir } = useLanguageContext();
  return { locale, setLocale, dir };
}

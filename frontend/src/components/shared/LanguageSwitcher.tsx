"use client";

import { LOCALES, LOCALE_LABELS, isLocale } from "@travel-agent/i18n";
import { useLocale, useT } from "@/i18n/useT";

/**
 * Native <select> rather than a custom dropdown: it is keyboard- and
 * screen-reader-correct for free, and it is the one control on the page whose
 * options must stay readable while the surrounding text direction flips.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <select
      aria-label={t("common.language")}
      value={locale}
      onChange={(e) => {
        if (isLocale(e.target.value)) setLocale(e.target.value);
      }}
      className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded px-1.5 py-1 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}

"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  LANG_STORAGE_KEY,
  dirOf,
  isLocale,
  type Locale,
} from "./config";
import { DICTIONARIES, type TKey } from "./dictionaries";
import { translate } from "./translate";
import type { TVars } from "./types";
import { API_URL } from "@/lib/config";
import { getOrCreateUserId } from "@/lib/api";

export interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  dir: "ltr" | "rtl";
  t: (key: TKey, vars?: TVars) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

function writeCookie(locale: Locale): void {
  document.cookie = `${LANG_COOKIE}=${locale}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function hasCookie(): boolean {
  return document.cookie.split("; ").some((part) => part.startsWith(`${LANG_COOKIE}=`));
}

/** Fire-and-forget: the UI must switch language even when the backend is down. */
function pushToBackend(locale: Locale): void {
  try {
    const userId = getOrCreateUserId();
    void fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: locale }),
    }).catch(() => {});
  } catch {
    // getOrCreateUserId touches localStorage, which can throw in private mode
  }
}

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // private mode — the cookie below is enough
    }
    writeCookie(next);
    pushToBackend(next);
  }, []);

  // Keep the document in sync. The server already rendered the right values from
  // the cookie; this covers every switch after that.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  // The cookie is what the server reads, so it wins. Without one — cleared site
  // data, a new browser, a user who picked Hebrew in the Telegram bot — fall back
  // to localStorage, then to whatever the backend has stored for this session.
  useEffect(() => {
    if (hasCookie()) return;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      stored = null;
    }

    if (isLocale(stored)) {
      if (stored !== initialLocale) setLocale(stored);
      else writeCookie(initialLocale);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const userId = getOrCreateUserId();
        const res = await fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const data: { language?: unknown } = await res.json();
        if (cancelled) return;
        if (isLocale(data.language) && data.language !== initialLocale) setLocale(data.language);
        else writeCookie(initialLocale);
      } catch {
        // offline or no backend — the default locale is already rendered
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      dir: dirOf(locale),
      t: (key: TKey, vars?: TVars) => translate(dict, locale, key, vars),
    };
  }, [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

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
import { browserLocale } from "./detectLocale";
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
  headerLocale = null,
  children,
}: {
  initialLocale: Locale;
  /**
   * What the request's Accept-Language asked for, or null if it asked for
   * nothing we support. Only meaningful on a cookieless first visit, where
   * `initialLocale` is this value and carries no other information.
   */
  headerLocale?: Locale | null;
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
      // localStorage is an external store the server could not read.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== initialLocale) setLocale(stored);
      else writeCookie(initialLocale);
      return;
    }

    let cancelled = false;
    (async () => {
      let answered = false;
      let saved: Locale | null = null;
      try {
        const userId = getOrCreateUserId();
        const res = await fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
          answered = true;
          const data: { language?: unknown } = await res.json();
          if (isLocale(data.language)) saved = data.language;
        }
      } catch {
        // offline or no backend — the browser's own language still applies
      }
      if (cancelled) return;

      // No cookie means nothing on this device has decided yet, so what is left
      // is detection. Accept-Language comes first: it is the visitor saying
      // which language they want content in, whereas navigator.language reports
      // the language the browser's own interface happens to be in. navigator
      // covers the case where no header reached us — stripped by a proxy, or
      // simply absent. A stored choice outranks both.
      const next = saved ?? headerLocale ?? browserLocale() ?? initialLocale;

      // setLocale, not writeCookie: a detected language is stored exactly like a
      // chosen one — cookie, localStorage and the backend — so /settings, the
      // Telegram bot and push all speak it from the first visit, and every later
      // session reads it back instead of guessing again. Only once the backend
      // has answered, though: persisting against an unreachable backend would
      // pin a guess here that a language stored elsewhere could never override.
      if (answered) setLocale(next);
      else if (next !== initialLocale) setLocaleState(next);
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

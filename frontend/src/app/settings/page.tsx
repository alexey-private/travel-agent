"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  getSettings,
  saveSettings,
  connectApple,
  disconnectApple,
  SettingsData,
} from "@/lib/settingsApi";
import { API_URL } from "@/lib/config";
import { useUserId } from "@/hooks/useUserId";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useT } from "@/i18n/useT";
import { MIRROR_UNDER_RTL } from "@/i18n/direction";
import type { TKey } from "@/i18n/dictionaries";

function SettingsContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const userId = useUserId();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  // The banner colour used to be inferred from the English copy ("Failed…"),
  // which stops working the moment the copy is translated — hence the flag.
  const [saveMsg, setSaveMsg] = useState<{ text: string; error: boolean } | null>(null);

  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [appleConnecting, setAppleConnecting] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  const { status: pushStatus, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } =
    usePushNotifications(userId);

  const reload = useCallback(async (uid: string) => {
    const updated = await getSettings(uid);
    setSettings(updated);
    if (updated.appleId) setAppleId(updated.appleId);
  }, []);

  useEffect(() => {
    if (!userId) return;
    getSettings(userId)
      .then((s) => {
        setSettings(s);
        if (s.appleId) setAppleId(s.appleId);
      })
      .catch(console.error);

    const googleAuth = searchParams.get("google_auth");
    if (googleAuth === "success") {
      // Reacts to the OAuth redirect in the URL — an external system.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveMsg({ text: t("settings.googleConnectSuccess"), error: false });
      window.history.replaceState({}, "", "/settings");
    } else if (googleAuth === "error") {
      const reason = searchParams.get("reason");
      setSaveMsg({
        text: t("settings.googleConnectFailed", {
          reason: reason ?? t("settings.googleConnectFailedUnknown"),
        }),
        error: true,
      });
      window.history.replaceState({}, "", "/settings");
    }
  }, [userId, searchParams, t]);

  const handleSelectProvider = useCallback((provider: "google" | "apple") => {
    if (!settings) return;
    setSettings({ ...settings, calendarProvider: provider });
    setSaveMsg(null);
  }, [settings]);

  const handleSave = useCallback(async () => {
    if (!userId || !settings) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveSettings(userId, {
        calendarProvider: settings.calendarProvider,
        calendarName: settings.calendarName,
        shoppingCalendarName: settings.shoppingCalendarName,
        taskListName: settings.taskListName,
        shoppingTaskListName: settings.shoppingTaskListName,
      });
      setSaveMsg({ text: t("settings.saved"), error: false });
    } catch {
      setSaveMsg({ text: t("settings.saveFailed"), error: true });
    } finally {
      setSaving(false);
    }
  }, [userId, settings, t]);

  const handleConnectApple = useCallback(async () => {
    if (!userId) return;
    setAppleConnecting(true);
    setAppleError(null);
    try {
      await connectApple(userId, appleId, appPassword);
      setAppPassword("");
      await reload(userId);
    } catch (err) {
      // connectApple relays the backend's own message when there is one, and an
      // ApiError key otherwise; translate() lets both through correctly.
      setAppleError(t((err as Error).message as TKey));
    } finally {
      setAppleConnecting(false);
    }
  }, [userId, appleId, appPassword, reload, t]);

  const handleDisconnectApple = useCallback(async () => {
    if (!userId) return;
    await disconnectApple(userId);
    await reload(userId);
  }, [userId, reload]);

  const handleDisconnectGoogle = useCallback(async () => {
    if (!userId) return;
    await fetch(`${API_URL}/auth/google/disconnect?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    await reload(userId);
  }, [userId, reload]);

  if (!userId || !settings) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  const isGoogle = settings.calendarProvider === "google";
  const isApple = settings.calendarProvider === "apple";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={20} className={MIRROR_UNDER_RTL} />
        </Link>
        <h1 className="text-lg font-semibold text-gray-800 me-auto">{t("settings.title")}</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* ── Language ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-6">
            <h2 className="text-base font-semibold text-gray-800 mb-3">{t("common.language")}</h2>
            <LanguageSwitcher />
          </div>
        </section>

        {/* ── Calendar & Tasks Provider ─────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-base font-semibold text-gray-800">{t("settings.providerTitle")}</h2>
            <p className="text-sm text-gray-500 mt-1">{t("settings.providerHint")}</p>
          </div>

          {/* Google Card */}
          <div
            className={`mx-4 mb-3 rounded-xl border transition-colors ${
              isGoogle ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50 cursor-pointer"
            }`}
            onClick={() => !isGoogle && handleSelectProvider("google")}
          >
            <div className="flex items-center gap-3 p-4">
              <input
                type="radio"
                name="provider"
                checked={isGoogle}
                onChange={() => handleSelectProvider("google")}
                onClick={(e) => e.stopPropagation()}
                className="accent-blue-600 mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{t("settings.googleTitle")}</span>
                  {settings.googleConnected && (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle2 size={12} /> {t("settings.connected")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t("settings.googleHint")}</p>
              </div>
            </div>

            {isGoogle && (
              <div className="px-4 pb-4 border-t border-blue-200 mt-1 pt-4">
                {settings.googleConnected ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">{t("settings.googleConnectedNote")}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDisconnectGoogle(); }}
                      className="text-sm text-red-500 hover:text-red-700 hover:underline"
                    >
                      {t("settings.disconnect")}
                    </button>
                  </div>
                ) : (
                  <a
                    href={`${API_URL}/auth/google/start?userId=${encodeURIComponent(userId)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-block bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t("settings.connectGoogleCalendar")}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Apple Card */}
          <div
            className={`mx-4 mb-4 rounded-xl border transition-colors ${
              isApple ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50 cursor-pointer"
            }`}
            onClick={() => !isApple && handleSelectProvider("apple")}
          >
            <div className="flex items-center gap-3 p-4">
              <input
                type="radio"
                name="provider"
                checked={isApple}
                onChange={() => handleSelectProvider("apple")}
                onClick={(e) => e.stopPropagation()}
                className="accent-blue-600 mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{t("settings.appleTitle")}</span>
                  {settings.appleConnected && (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle2 size={12} /> {t("settings.connected")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t("settings.appleHint")}</p>
              </div>
            </div>

            {isApple && (
              <div className="px-4 pb-4 border-t border-blue-200 mt-1 pt-4">
                {settings.appleConnected ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      {t("settings.connectedAs", { appleId: settings.appleId ?? "" })}
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDisconnectApple(); }}
                      className="text-sm text-red-500 hover:text-red-700 hover:underline"
                    >
                      {t("settings.disconnect")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t("settings.appleIdLabel")}</label>
                      <input
                        type="email"
                        value={appleId}
                        onChange={(e) => setAppleId(e.target.value)}
                        placeholder={t("settings.appleIdPlaceholder")}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t("settings.appPasswordLabel")}</label>
                      <input
                        type="password"
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder={t("settings.appPasswordPlaceholder")}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                        <p className="font-medium">{t("settings.appPasswordHowTo")}</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
                          <li>{t("settings.appPasswordStepOpen")} <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">appleid.apple.com <ExternalLink size={9} /></a></li>
                          <li>{t("settings.appPasswordStepSignIn")}</li>
                          <li>{t("settings.appPasswordStepGoTo")} <strong>{t("settings.appPasswordSignInAndSecurity")}</strong></li>
                          <li>{t("settings.appPasswordStepClick")} <strong>{t("settings.appPasswordAppSpecificPasswords")}</strong></li>
                          <li>{t("settings.appPasswordStepClick")} <strong>+</strong> {t("settings.appPasswordStepNameIt")}</li>
                          <li>{t("settings.appPasswordStepCopy")}</li>
                        </ol>
                      </div>
                    </div>
                    {appleError && <p className="text-sm text-red-600">{appleError}</p>}
                    <button
                      onClick={handleConnectApple}
                      disabled={appleConnecting || !appleId || !appPassword}
                      className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {appleConnecting && <Loader2 size={14} className="animate-spin" />}
                      {t("settings.connectApple")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Google Drive ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-800">{t("settings.driveTitle")}</h2>
                <p className="text-sm text-gray-500 mt-1">{t("settings.driveHint")}</p>
              </div>
              {settings.googleDriveConnected ? (
                <span className="flex items-center gap-1 text-green-600 text-sm font-medium shrink-0 mt-0.5">
                  <CheckCircle2 size={14} /> {t("settings.connected")}
                </span>
              ) : (
                <a
                  href={`${API_URL}/auth/google/start?userId=${encodeURIComponent(userId)}`}
                  className="inline-block shrink-0 bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t("settings.connectGoogle")}
                </a>
              )}
            </div>
            {settings.googleDriveConnected && (
              <p className="text-xs text-gray-400 mt-3">{t("settings.driveConnectedNote")}</p>
            )}
          </div>
        </section>

        {/* ── Calendar Names ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">{t("settings.calendarNamesTitle")}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.travelCalendarName")}</label>
              <input
                type="text"
                value={settings.calendarName}
                onChange={(e) => setSettings({ ...settings, calendarName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.shoppingCalendarName")}</label>
              <input
                type="text"
                value={settings.shoppingCalendarName}
                onChange={(e) => setSettings({ ...settings, shoppingCalendarName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* ── Task List Names (Google only) ────────────────────── */}
        {isGoogle && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("settings.taskListNamesTitle")}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.travelTaskList")}</label>
                <input
                  type="text"
                  value={settings.taskListName}
                  onChange={(e) => setSettings({ ...settings, taskListName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.shoppingTaskList")}</label>
                <input
                  type="text"
                  value={settings.shoppingTaskListName}
                  onChange={(e) => setSettings({ ...settings, shoppingTaskListName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>
        )}

        {/* ── Browser Notifications ───────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">{t("settings.notificationsTitle")}</h2>
              <p className="text-sm text-gray-500 mt-1">{t("settings.notificationsHint")}</p>
            </div>

            {pushStatus === "unsupported" && (
              <span className="text-sm text-gray-400 shrink-0">{t("settings.notSupported")}</span>
            )}

            {pushStatus === "denied" && (
              <span className="text-sm text-red-500 shrink-0">{t("settings.blockedByBrowser")}</span>
            )}

            {pushStatus === "subscribed" && (
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                  <CheckCircle2 size={14} /> {t("settings.enabled")}
                </span>
                <button
                  onClick={pushUnsubscribe}
                  className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <BellOff size={14} /> {t("settings.disable")}
                </button>
              </div>
            )}

            {(pushStatus === "unsubscribed" || pushStatus === "subscribing") && (
              <button
                onClick={pushSubscribe}
                disabled={pushStatus === "subscribing"}
                className="flex items-center gap-1.5 shrink-0 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {pushStatus === "subscribing"
                  ? <><Loader2 size={14} className="animate-spin" /> {t("settings.enabling")}</>
                  : <><Bell size={14} /> {t("settings.enableNotifications")}</>}
              </button>
            )}
          </div>

          {pushStatus === "denied" && (
            <p className="text-xs text-gray-400 mt-3">{t("settings.deniedHint")}</p>
          )}
        </section>

        {/* ── Save ────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t("settings.save")}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.error ? "text-red-600" : "text-green-600"}`}>
              {saveMsg.text}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" size={24} /></div>}>
      <SettingsContent />
    </Suspense>
  );
}

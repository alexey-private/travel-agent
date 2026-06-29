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
import { getOrCreateUserId } from "@/lib/api";
import {
  getSettings,
  saveSettings,
  connectApple,
  disconnectApple,
  SettingsData,
} from "@/lib/settingsApi";
import { API_URL } from "@/lib/config";

function SettingsContent() {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

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
    const uid = getOrCreateUserId();
    setUserId(uid);
    getSettings(uid)
      .then((s) => {
        setSettings(s);
        if (s.appleId) setAppleId(s.appleId);
      })
      .catch(console.error);

    const googleAuth = searchParams.get("google_auth");
    if (googleAuth === "success") {
      setSaveMsg("Google Calendar connected successfully.");
      window.history.replaceState({}, "", "/settings");
    } else if (googleAuth === "error") {
      const reason = searchParams.get("reason");
      setSaveMsg(`Google connection failed: ${reason ?? "unknown error"}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchParams]);

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
      setSaveMsg("Settings saved.");
    } catch {
      setSaveMsg("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }, [userId, settings]);

  const handleConnectApple = useCallback(async () => {
    if (!userId) return;
    setAppleConnecting(true);
    setAppleError(null);
    try {
      await connectApple(userId, appleId, appPassword);
      setAppPassword("");
      await reload(userId);
    } catch (err) {
      setAppleError((err as Error).message);
    } finally {
      setAppleConnecting(false);
    }
  }, [userId, appleId, appPassword, reload]);

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
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold text-gray-800">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* ── Calendar & Tasks Provider ─────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-base font-semibold text-gray-800">Calendar &amp; Tasks Provider</h2>
            <p className="text-sm text-gray-500 mt-1">Only one service is active at a time.</p>
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
                  <span className="text-sm font-medium text-gray-800">Google Calendar &amp; Tasks</span>
                  {settings.googleConnected && (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle2 size={12} /> Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Google Calendar and Google Tasks</p>
              </div>
            </div>

            {isGoogle && (
              <div className="px-4 pb-4 border-t border-blue-200 mt-1 pt-4">
                {settings.googleConnected ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Google account connected.</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDisconnectGoogle(); }}
                      className="text-sm text-red-500 hover:text-red-700 hover:underline"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <a
                    href={`${API_URL}/auth/google/start?userId=${encodeURIComponent(userId)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-block bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Connect Google Calendar
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
                  <span className="text-sm font-medium text-gray-800">Apple iCloud</span>
                  {settings.appleConnected && (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle2 size={12} /> Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Apple Calendar via iCloud — tasks appear as calendar events</p>
              </div>
            </div>

            {isApple && (
              <div className="px-4 pb-4 border-t border-blue-200 mt-1 pt-4">
                {settings.appleConnected ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Connected as <span className="font-medium">{settings.appleId}</span>
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDisconnectApple(); }}
                      className="text-sm text-red-500 hover:text-red-700 hover:underline"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Apple ID</label>
                      <input
                        type="email"
                        value={appleId}
                        onChange={(e) => setAppleId(e.target.value)}
                        placeholder="you@icloud.com"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">App-specific password</label>
                      <input
                        type="password"
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="xxxx-xxxx-xxxx-xxxx"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                        <p className="font-medium">How to get an app-specific password:</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
                          <li>Open <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">appleid.apple.com <ExternalLink size={9} /></a></li>
                          <li>Sign in with your Apple ID</li>
                          <li>Go to <strong>Sign-In and Security</strong></li>
                          <li>Click <strong>App-Specific Passwords</strong></li>
                          <li>Click <strong>+</strong> and name it (e.g. "AI Agent")</li>
                          <li>Copy the generated password (format: xxxx-xxxx-xxxx-xxxx)</li>
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
                      Connect Apple iCloud
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Calendar Names ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Calendar Names</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Travel calendar name</label>
              <input
                type="text"
                value={settings.calendarName}
                onChange={(e) => setSettings({ ...settings, calendarName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shopping calendar name</label>
              <input
                type="text"
                value={settings.shoppingCalendarName}
                onChange={(e) => setSettings({ ...settings, shoppingCalendarName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* ── Task List Names (Google only) ────────────────────── */}
        {isGoogle && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Task List Names</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Travel task list</label>
                <input
                  type="text"
                  value={settings.taskListName}
                  onChange={(e) => setSettings({ ...settings, taskListName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shopping task list</label>
                <input
                  type="text"
                  value={settings.shoppingTaskListName}
                  onChange={(e) => setSettings({ ...settings, shoppingTaskListName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>
        )}

        {/* ── Browser Notifications ───────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Browser Notifications</h2>
              <p className="text-sm text-gray-500 mt-1">
                Daily reminders at 9:00 AM for events and tasks due tomorrow.
              </p>
            </div>

            {pushStatus === "unsupported" && (
              <span className="text-sm text-gray-400 shrink-0">Not supported</span>
            )}

            {pushStatus === "denied" && (
              <span className="text-sm text-red-500 shrink-0">Blocked by browser</span>
            )}

            {pushStatus === "subscribed" && (
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                  <CheckCircle2 size={14} /> Enabled
                </span>
                <button
                  onClick={pushUnsubscribe}
                  className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <BellOff size={14} /> Disable
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
                  ? <><Loader2 size={14} className="animate-spin" /> Enabling…</>
                  : <><Bell size={14} /> Enable notifications</>}
              </button>
            )}
          </div>

          {pushStatus === "denied" && (
            <p className="text-xs text-gray-400 mt-3">
              To enable, open browser settings and allow notifications for this site.
            </p>
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
            Save settings
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.startsWith("Failed") || saveMsg.startsWith("Google connection failed") ? "text-red-600" : "text-green-600"}`}>
              {saveMsg}
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

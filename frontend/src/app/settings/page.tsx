"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { getOrCreateUserId } from "@/lib/api";
import {
  getSettings,
  saveSettings,
  connectApple,
  disconnectApple,
  getAppleReminderLists,
  saveAppleReminderList,
  SettingsData,
  ReminderList,
} from "@/lib/settingsApi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [appleConnecting, setAppleConnecting] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [reminderLists, setReminderLists] = useState<ReminderList[]>([]);
  const [reminderListsLoading, setReminderListsLoading] = useState(false);
  const [selectedReminderUrl, setSelectedReminderUrl] = useState("");
  const [selectedShoppingReminderUrl, setSelectedShoppingReminderUrl] = useState("");

  const loadReminderLists = useCallback(async (uid: string, savedHref?: string | null, savedShoppingHref?: string | null) => {
    setReminderListsLoading(true);
    try {
      const lists = await getAppleReminderLists(uid);
      setReminderLists(lists);
      if (savedHref) setSelectedReminderUrl(savedHref);
      if (savedShoppingHref) setSelectedShoppingReminderUrl(savedShoppingHref);
    } catch { /* non-critical */ }
    finally { setReminderListsLoading(false); }
  }, []);

  const reload = useCallback(async (uid: string) => {
    const updated = await getSettings(uid);
    setSettings(updated);
    if (updated.appleId) setAppleId(updated.appleId);
    if (updated.appleConnected) void loadReminderLists(uid, updated.reminderHref, updated.shoppingReminderHref);
  }, [loadReminderLists]);

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);
    getSettings(uid)
      .then((s) => {
        setSettings(s);
        if (s.appleId) setAppleId(s.appleId);
        if (s.appleConnected) void loadReminderLists(uid, s.reminderHref, s.shoppingReminderHref);
      })
      .catch(console.error);
  }, [loadReminderLists]);

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
    setReminderLists([]);
    await reload(userId);
  }, [userId, reload]);

  const handleSelectReminderList = useCallback(async (url: string, isShoppingList: boolean) => {
    if (!userId) return;
    await saveAppleReminderList(userId, url, isShoppingList);
    setSaveMsg("Reminder list saved.");
  }, [userId]);

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

            {/* Expanded: Google connection details (only when active) */}
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
                <p className="text-xs text-gray-500 mt-0.5">Apple Calendar and Apple Reminders via iCloud</p>
              </div>
            </div>

            {/* Expanded: Apple connection details (only when active) */}
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

        {/* ── Task List Names ──────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-800">Task List Names</h2>
            {isApple && settings.appleConnected && (
              <button
                onClick={() => userId && void loadReminderLists(userId)}
                disabled={reminderListsLoading}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 flex items-center gap-1"
              >
                <Loader2 size={11} className={reminderListsLoading ? "animate-spin" : "hidden"} />
                Refresh lists
              </button>
            )}
          </div>
          {isApple && settings.appleConnected && (
            <p className="text-xs text-gray-500 mb-4">Select existing Reminders lists from your iCloud account. If you just created a new list, click Refresh.</p>
          )}
          {isApple && !settings.appleConnected && (
            <p className="text-xs text-gray-500 mb-4">Connect Apple iCloud above to select Reminders lists.</p>
          )}
          {!isApple && <div className="mb-4" />}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Travel task list</label>
              {isApple && settings.appleConnected ? (
                reminderListsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading lists…</div>
                ) : (
                  <select
                    value={selectedReminderUrl}
                    onChange={(e) => {
                      const selected = reminderLists.find(l => l.url === e.target.value);
                      if (selected) {
                        setSelectedReminderUrl(selected.url);
                        setSettings({ ...settings, taskListName: selected.name });
                        void handleSelectReminderList(selected.url, false);
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— select a list —</option>
                    {reminderLists.map(l => <option key={l.url} value={l.url}>{l.name}</option>)}
                  </select>
                )
              ) : (
                <input
                  type="text"
                  value={settings.taskListName}
                  onChange={(e) => setSettings({ ...settings, taskListName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shopping task list</label>
              {isApple && settings.appleConnected ? (
                reminderListsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading lists…</div>
                ) : (
                  <select
                    value={selectedShoppingReminderUrl}
                    onChange={(e) => {
                      const selected = reminderLists.find(l => l.url === e.target.value);
                      if (selected) {
                        setSelectedShoppingReminderUrl(selected.url);
                        setSettings({ ...settings, shoppingTaskListName: selected.name });
                        void handleSelectReminderList(selected.url, true);
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— select a list —</option>
                    {reminderLists.map(l => <option key={l.url} value={l.url}>{l.name}</option>)}
                  </select>
                )
              ) : (
                <input
                  type="text"
                  value={settings.shoppingTaskListName}
                  onChange={(e) => setSettings({ ...settings, shoppingTaskListName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>
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
            <span className={`text-sm ${saveMsg.startsWith("Failed") ? "text-red-600" : "text-green-600"}`}>
              {saveMsg}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

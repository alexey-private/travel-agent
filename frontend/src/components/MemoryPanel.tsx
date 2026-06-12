"use client";

import { useCallback, useEffect } from "react";
import { Trash2, RefreshCw, Brain, Calendar, CheckCircle2, XCircle, Settings } from "lucide-react";
import Link from "next/link";
import { fetchMemories, deleteMemory, disconnectGoogleCalendar } from "@/lib/api";
import { getSettings, disconnectApple } from "@/lib/settingsApi";
import { API_URL } from "@/lib/config";
import { useAsync } from "@/hooks/useAsync";

interface MemoryPanelProps {
  userId: string;
  agentType: "travel" | "shopping";
  /** Incremented by parent whenever new memories may have been saved */
  refreshTrigger?: number;
}

export default function MemoryPanel({ userId, agentType, refreshTrigger }: MemoryPanelProps) {
  const {
    data: memories,
    loading,
    error,
    reload: loadMemories,
    setData: setMemories,
  } = useAsync(() => fetchMemories(userId, agentType), [userId, agentType, refreshTrigger]);

  const {
    data: providerSettings,
    reload: loadProviderSettings,
  } = useAsync(() => getSettings(userId), [userId]);

  // Handle ?google_auth=success|error redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google_auth");
    if (status === "success" || status === "error") {
      window.history.replaceState({}, "", window.location.pathname);
      loadProviderSettings();
    }
  }, [loadProviderSettings]);

  const handleGoogleConnect = () => {
    window.location.href = `${API_URL}/auth/google/start?userId=${encodeURIComponent(userId)}`;
  };

  const handleGoogleDisconnect = useCallback(async () => {
    await disconnectGoogleCalendar(userId);
    loadProviderSettings();
  }, [userId, loadProviderSettings]);

  const handleAppleDisconnect = useCallback(async () => {
    await disconnectApple(userId);
    loadProviderSettings();
  }, [userId, loadProviderSettings]);

  const handleDelete = useCallback(async (key: string) => {
    try {
      await deleteMemory(userId, key, agentType);
      setMemories((prev) => prev?.filter((m) => m.key !== key) ?? prev);
    } catch {
      // silently ignore
    }
  }, [userId, agentType, setMemories]);

  const memoryList = memories ?? [];

  return (
    <aside className="w-64 border-l border-gray-200 flex flex-col bg-gray-50 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Brain size={15} />
          Your Preferences
        </div>
        <button
          onClick={loadMemories}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
          title="Refresh memories"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {error && (
          <p className="text-xs text-red-500 text-center">{error}</p>
        )}

        {!loading && memoryList.length === 0 && !error && (
          <p className="text-xs text-gray-400 text-center mt-4">
            No preferences saved yet.
            <br />
            Chat with the agent and it will remember your preferences.
          </p>
        )}

        {memoryList.map((mem) => (
          <div
            key={mem.key}
            className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 capitalize">
                {mem.key.replace(/_/g, " ")}
              </p>
              <p className="text-sm text-gray-800 truncate" title={mem.value}>
                {mem.value}
              </p>
            </div>
            <button
              onClick={() => void handleDelete(mem.key)}
              className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
              title={`Delete "${mem.key}"`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Active provider status */}
      <div className="border-t border-gray-200 p-3 bg-white">
        {providerSettings === null ? (
          <p className="text-xs text-gray-400">Checking…</p>
        ) : providerSettings.calendarProvider === "apple" ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-gray-500" />
                <span className="text-xs font-semibold text-gray-600">Apple iCloud</span>
              </div>
              <Link href="/settings" className="text-gray-400 hover:text-gray-600">
                <Settings size={12} />
              </Link>
            </div>
            {providerSettings.appleConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle2 size={12} /> Connected
                </div>
                <button
                  onClick={() => void handleAppleDisconnect()}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <Link
                href="/settings"
                className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <XCircle size={12} className="text-gray-400" />
                Connect Apple iCloud
              </Link>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-gray-500" />
                <span className="text-xs font-semibold text-gray-600">Google Calendar</span>
              </div>
              <Link href="/settings" className="text-gray-400 hover:text-gray-600">
                <Settings size={12} />
              </Link>
            </div>
            {providerSettings.googleConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle2 size={12} /> Connected
                </div>
                <button
                  onClick={() => void handleGoogleDisconnect()}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleConnect}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <XCircle size={12} className="text-gray-400" />
                Connect Google Calendar
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

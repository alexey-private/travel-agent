"use client";

import { useState, useEffect } from "react";
import { Plane } from "lucide-react";
import ChatWindow from "@/components/ChatWindow";
import MemoryPanel from "@/components/MemoryPanel";
import { getOrCreateUserId } from "@/lib/api";

/**
 * Root page — full-height layout with header, chat window, and memory panel.
 */
export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [memoryRefresh, setMemoryRefresh] = useState(0);

  // Initialise userId client-side only (localStorage is not available during SSR)
  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

  if (!userId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <Plane size={20} className="text-blue-600" />
          <span className="font-semibold text-gray-800">Travel Planning Agent</span>
        </div>
        <span className="text-xs text-gray-400 font-mono">{userId.slice(0, 8)}…</span>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Chat area */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          <ChatWindow
            userId={userId}
            onReplyComplete={() => setMemoryRefresh((n) => n + 1)}
          />
        </main>

        {/* Memory panel */}
        <MemoryPanel userId={userId} refreshTrigger={memoryRefresh} />
      </div>
    </div>
  );
}

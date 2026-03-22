"use client";

import { useState, useEffect, useCallback } from "react";
import { Plane } from "lucide-react";
import ChatWindow from "@/components/ChatWindow";
import MemoryPanel from "@/components/MemoryPanel";
import ConversationList from "@/components/ConversationList";
import { getOrCreateUserId } from "@/lib/api";

/**
 * Root page — full-height layout with conversation sidebar, chat window, and memory panel.
 */
export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [memoryRefresh, setMemoryRefresh] = useState(0);
  const [conversationListRefresh, setConversationListRefresh] = useState(0);
  /** Currently open conversation. null = new (unsaved) chat. */
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  /** Incrementing this key unmounts/remounts ChatWindow, resetting all conversation state. */
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setChatKey((k) => k + 1);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setSelectedConversationId(id);
    setConversationListRefresh((n) => n + 1);
  }, []);

  const handleReplyComplete = useCallback(() => {
    setMemoryRefresh((n) => n + 1);
    setConversationListRefresh((n) => n + 1);
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
        {/* Conversation sidebar */}
        <ConversationList
          userId={userId}
          selectedId={selectedConversationId}
          refreshTrigger={conversationListRefresh}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
        />

        {/* Chat area */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          <ChatWindow
            key={chatKey}
            userId={userId}
            initialConversationId={selectedConversationId}
            onConversationCreated={handleConversationCreated}
            onReplyComplete={handleReplyComplete}
          />
        </main>

        {/* Memory panel */}
        <MemoryPanel userId={userId} refreshTrigger={memoryRefresh} />
      </div>
    </div>
  );
}

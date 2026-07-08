"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Plane, Settings, CalendarDays, Sparkles, Menu, Brain } from "lucide-react";
import ChatWindow from "@/components/chat/ChatWindow";
import MemoryPanel, { type MemoryPanelHandle } from "@/components/memory/MemoryPanel";
import ConversationList, { type ConversationListHandle } from "@/components/conversations/ConversationList";
import AgentSelector, { type AgentType } from "@/components/shared/AgentSelector";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { getOrCreateUserId } from "@/lib/api";

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [agentType, setAgentType] = useState<AgentType>("travel");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  const conversationListRef = useRef<ConversationListHandle>(null);
  const memoryPanelRef = useRef<MemoryPanelHandle>(null);

  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    setChatKey((k) => k + 1);
    setSidebarOpen(false);
  }, []);

  const handleAgentChange = useCallback((type: AgentType) => {
    setAgentType(type);
    setSelectedConversationId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setChatKey((k) => k + 1);
    setSidebarOpen(false);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setSelectedConversationId(id);
    conversationListRef.current?.reload();
  }, []);

  const handleReplyComplete = useCallback(() => {
    memoryPanelRef.current?.reload();
    conversationListRef.current?.reload();
  }, []);

  const handleConversationDeleted = useCallback((id: string) => {
    if (selectedConversationId === id) {
      setSelectedConversationId(null);
      setChatKey((k) => k + 1);
    }
  }, [selectedConversationId]);

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
      <header className="relative z-50 flex items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle conversations"
            className="md:hidden text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          >
            <Menu size={20} />
          </button>
          <Plane size={20} className="text-blue-600 shrink-0" />
          <span className="font-semibold text-gray-800 hidden sm:inline truncate">AI Agent</span>
        </div>
        <AgentSelector value={agentType} onChange={handleAgentChange} />
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-xs text-gray-400 font-mono hidden md:inline">{userId.slice(0, 8)}…</span>
          <Link href="/features" title="What this app can do" className="hidden sm:inline text-gray-400 hover:text-gray-700 transition-colors">
            <Sparkles size={18} />
          </Link>
          <Link href="/calendar" title="Calendar & Tasks" className="text-gray-400 hover:text-gray-700 transition-colors">
            <CalendarDays size={18} />
          </Link>
          <Link href="/settings" title="Settings" className="hidden sm:inline text-gray-400 hover:text-gray-700 transition-colors">
            <Settings size={18} />
          </Link>
          <button
            onClick={() => setMemoryOpen((v) => !v)}
            aria-label="Toggle preferences"
            className="lg:hidden text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Brain size={18} />
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile backdrop for sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Conversation sidebar — slides in on mobile, static on desktop */}
        <div
          className={`fixed md:static inset-y-0 left-0 z-40 md:z-auto transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ConversationList
            ref={conversationListRef}
            userId={userId}
            agentType={agentType}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            onNewChat={handleNewChat}
            onDelete={handleConversationDeleted}
          />
        </div>

        {/* Chat area */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          <ErrorBoundary>
            <ChatWindow
              key={chatKey}
              userId={userId}
              initialConversationId={selectedConversationId}
              agentType={agentType}
              onConversationCreated={handleConversationCreated}
              onReplyComplete={handleReplyComplete}
            />
          </ErrorBoundary>
        </main>

        {/* Mobile backdrop for memory panel */}
        {memoryOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setMemoryOpen(false)}
          />
        )}

        {/* Memory panel — slides in on mobile/tablet, static on desktop */}
        <div
          className={`fixed lg:static inset-y-0 right-0 z-40 lg:z-auto transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
            memoryOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <ErrorBoundary>
            <MemoryPanel ref={memoryPanelRef} userId={userId} agentType={agentType} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

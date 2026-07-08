"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Plane, Settings, CalendarDays, Sparkles } from "lucide-react";
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

  const conversationListRef = useRef<ConversationListHandle>(null);
  const memoryPanelRef = useRef<MemoryPanelHandle>(null);

  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleAgentChange = useCallback((type: AgentType) => {
    setAgentType(type);
    setSelectedConversationId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setChatKey((k) => k + 1);
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
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <Plane size={20} className="text-blue-600" />
          <span className="font-semibold text-gray-800">AI Agent</span>
        </div>
        <AgentSelector value={agentType} onChange={handleAgentChange} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-mono">{userId.slice(0, 8)}…</span>
          <Link href="/features" title="What this app can do" className="text-gray-400 hover:text-gray-700 transition-colors">
            <Sparkles size={18} />
          </Link>
          <Link href="/calendar" title="Calendar & Tasks" className="text-gray-400 hover:text-gray-700 transition-colors">
            <CalendarDays size={18} />
          </Link>
          <Link href="/settings" title="Settings" className="text-gray-400 hover:text-gray-700 transition-colors">
            <Settings size={18} />
          </Link>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Conversation sidebar */}
        <ConversationList
          ref={conversationListRef}
          userId={userId}
          agentType={agentType}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onDelete={handleConversationDeleted}
        />

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

        {/* Memory panel */}
        <ErrorBoundary>
          <MemoryPanel ref={memoryPanelRef} userId={userId} agentType={agentType} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

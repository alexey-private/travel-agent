"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { fetchConversations, type Conversation } from "@/lib/api";

interface ConversationListProps {
  userId: string;
  selectedId: string | null;
  refreshTrigger: number;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ConversationList({
  userId,
  selectedId,
  refreshTrigger,
  onSelect,
  onNewChat,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    try {
      setConversations(await fetchConversations(userId));
    } catch {
      // silently ignore fetch errors
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-gray-900 text-gray-100 h-full">
      {/* New chat button */}
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-700 transition-colors"
        >
          <Plus size={15} />
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {conversations.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-500">No conversations yet</p>
        )}
        {conversations.map((c) => {
          const isActive = c.id === selectedId;
          const title = c.title?.slice(0, 60) ?? "New conversation";
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-gray-700 transition-colors ${
                isActive ? "bg-gray-700" : ""
              }`}
            >
              <MessageSquare size={13} className="mt-0.5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs truncate leading-snug">{title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(c.created_at)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

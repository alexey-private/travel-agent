"use client";

import { forwardRef, useImperativeHandle, useCallback, useState } from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { fetchConversations, deleteConversation, type Conversation } from "@/lib/api";
import { formatDate } from "@/lib/dateUtils";
import { useAsync } from "@/hooks/useAsync";
import { useT } from "@/i18n/useT";

export interface ConversationListHandle {
  reload: () => void;
}

interface ConversationListProps {
  userId: string;
  agentType: "travel" | "shopping";
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  onDelete?: (conversationId: string) => void;
}

const ConversationList = forwardRef<ConversationListHandle, ConversationListProps>(
  function ConversationList({ userId, agentType, selectedId, onSelect, onNewChat, onDelete }, ref) {
    const t = useT();
    const { data, reload, setData } = useAsync<Conversation[]>(
      () => fetchConversations(userId, agentType),
      [userId, agentType],
    );
    const conversations = data ?? [];
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ reload }), [reload]);

    const handleDelete = useCallback(async (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation();
      setDeletingId(conversationId);
      try {
        await deleteConversation(userId, conversationId);
        setData((prev) => prev?.filter((c) => c.id !== conversationId) ?? prev);
        onDelete?.(conversationId);
      } catch {
        // silently ignore
      } finally {
        setDeletingId(null);
      }
    }, [userId, onDelete, setData]);

    return (
      <aside className="w-56 shrink-0 flex flex-col bg-gray-900 text-gray-100 h-full">
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-700 transition-colors"
          >
            <Plus size={15} />
            {t("conversations.newChat")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {conversations.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-500">{t("conversations.empty")}</p>
          )}
          {conversations.map((c) => {
            const isActive = c.id === selectedId;
            const title = c.title?.slice(0, 60) ?? t("conversations.untitled");
            const isDeleting = deletingId === c.id;
            return (
              <div
                key={c.id}
                className={`group relative flex items-start hover:bg-gray-700 transition-colors ${
                  isActive ? "bg-gray-700" : ""
                }`}
              >
                <button
                  onClick={() => onSelect(c.id)}
                  className="flex-1 text-left px-3 py-2.5 flex items-start gap-2 min-w-0"
                >
                  <MessageSquare size={13} className="mt-0.5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate leading-snug">{title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(c.created_at)}</p>
                  </div>
                </button>
                <button
                  onClick={(e) => void handleDelete(e, c.id)}
                  disabled={isDeleting}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-2 mt-1 text-gray-500 hover:text-red-400 transition-all disabled:opacity-30"
                  title={t("conversations.delete")}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    );
  },
);

export default ConversationList;

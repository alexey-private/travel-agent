"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { streamChat } from "@/lib/api";
import { type MessagesAction, type Attachment } from "@/types/agent";
import { type AgentType } from "@/components/shared/AgentSelector";
import type { TKey } from "@/i18n/dictionaries";
import type { TVars } from "@/i18n/types";

interface UseStreamChatOptions {
  userId: string;
  agentType: AgentType;
  initialConversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onReplyComplete?: () => void;
  dispatch: React.Dispatch<MessagesAction>;
  /** Passed in by the owning component — hooks cannot call useT() for it. */
  t: (key: TKey, vars?: TVars) => string;
}

interface UseStreamChatResult {
  loading: boolean;
  conversationId: string | null;
  send: (displayText: string, fullText: string, attachments?: Attachment[]) => Promise<void>;
  abortRef: React.MutableRefObject<AbortController | null>;
}

export function useStreamChat({
  userId,
  agentType,
  initialConversationId,
  onConversationCreated,
  onReplyComplete,
  dispatch,
  t,
}: UseStreamChatOptions): UseStreamChatResult {
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  // Abort stream when component unmounts
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const send = useCallback(async (displayText: string, fullText: string, attachments?: Attachment[]) => {
    setLoading(true);

    const now = new Date().toISOString();
    dispatch({ type: "ADD", message: { id: crypto.randomUUID(), role: "user", content: displayText, createdAt: now } });

    const assistantMsgId = crypto.randomUUID();
    dispatch({ type: "ADD", message: { id: assistantMsgId, role: "assistant", content: "", steps: [], streaming: true, createdAt: now } });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        userId,
        fullText,
        conversationIdRef.current,
        (event) => {
          switch (event.type) {
            case "conversation_id":
              setConversationId(event.conversationId);
              onConversationCreated?.(event.conversationId);
              break;
            case "text":
              dispatch({ type: "STREAM_TEXT", id: assistantMsgId, chunk: event.content });
              break;
            case "tool_start":
              dispatch({ type: "TOOL_START", id: assistantMsgId, tool: event.tool, input: event.input });
              break;
            case "tool_end":
              dispatch({ type: "TOOL_END", id: assistantMsgId, tool: event.tool, output: event.output, error: event.error });
              break;
            case "sources":
              dispatch({ type: "SET_SOURCES", id: assistantMsgId, sources: event.sources });
              break;
            case "suggestions":
              dispatch({ type: "SET_SUGGESTIONS", id: assistantMsgId, suggestions: event.suggestions });
              break;
            case "done":
              dispatch({ type: "MARK_DONE", id: assistantMsgId });
              break;
          }
        },
        controller.signal,
        agentType,
        attachments?.length ? attachments : undefined,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // ApiError carries a dictionary key as its message; anything else is
      // already human-readable, and translate() returns an unknown key as-is.
      const errMsg = err instanceof Error ? t(err.message as TKey) : t("errors.unknown");
      dispatch({ type: "MARK_ERROR", id: assistantMsgId, error: `${t("chat.stepError")}: ${errMsg}` });
    } finally {
      setLoading(false);
      onReplyComplete?.();
    }
  }, [userId, agentType, onConversationCreated, onReplyComplete, dispatch, t]);

  return { loading, conversationId, send, abortRef };
}

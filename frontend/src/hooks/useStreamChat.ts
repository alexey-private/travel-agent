"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { streamChat } from "@/lib/api";
import { type AgentEvent, type Message, type ToolStep, type Attachment } from "@/types/agent";
import { type AgentType } from "@/components/AgentSelector";

interface UseStreamChatOptions {
  userId: string;
  agentType: AgentType;
  initialConversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onReplyComplete?: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

interface UseStreamChatResult {
  loading: boolean;
  conversationId: string | null;
  /** Send a message. displayText shown in the user bubble; fullText sent to the API. */
  send: (displayText: string, fullText: string, attachments?: Attachment[]) => Promise<void>;
  abortRef: React.MutableRefObject<AbortController | null>;
}

export function useStreamChat({
  userId,
  agentType,
  initialConversationId,
  onConversationCreated,
  onReplyComplete,
  setMessages,
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

    // User bubble
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: displayText }]);

    // Assistant placeholder
    const assistantMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "", steps: [], streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    let textAccum = "";
    const stepsMap = new Map<string, ToolStep>();

    try {
      await streamChat(
        userId,
        fullText,
        conversationIdRef.current,
        (event: AgentEvent) => {
          switch (event.type) {
            case "conversation_id": {
              setConversationId(event.conversationId);
              onConversationCreated?.(event.conversationId);
              break;
            }
            case "text": {
              textAccum += event.content;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: textAccum } : m)),
              );
              break;
            }
            case "tool_start": {
              const stepId = `step-${stepsMap.size}`;
              stepsMap.set(stepId, { id: stepId, tool: event.tool, input: event.input, pending: true });
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, steps: Array.from(stepsMap.values()) } : m)),
              );
              break;
            }
            case "tool_end": {
              const pendingKey = Array.from(stepsMap.entries())
                .reverse()
                .find(([, s]) => s.tool === event.tool && s.pending)?.[0];
              if (pendingKey) {
                const existing = stepsMap.get(pendingKey)!;
                stepsMap.set(pendingKey, { ...existing, output: event.output, error: event.error, pending: false });
              }
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, steps: Array.from(stepsMap.values()) } : m)),
              );
              break;
            }
            case "sources": {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, sources: event.sources } : m)),
              );
              break;
            }
            case "suggestions": {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, suggestions: event.suggestions } : m)),
              );
              break;
            }
            case "done": {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)),
              );
              break;
            }
          }
        },
        controller.signal,
        agentType,
        attachments?.length ? attachments : undefined,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, content: `Error: ${errMsg}`, streaming: false } : m)),
      );
    } finally {
      setLoading(false);
      onReplyComplete?.();
    }
  }, [userId, agentType, onConversationCreated, onReplyComplete, setMessages]);

  return { loading, conversationId, send, abortRef };
}

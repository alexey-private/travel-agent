"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2 } from "lucide-react";
import MessageBubble, { type Message } from "./MessageBubble";
import { getRandomSuggestions } from "../data/starterSuggestions";
import { streamChat, fetchMessages, type AgentEvent, type ChatMessage } from "@/lib/api";
import { type ToolStep } from "./AgentThoughts";

interface ChatWindowProps {
  userId: string;
  /** Pre-selected conversation to load/continue */
  initialConversationId?: string | null;
  /** Called when the backend assigns a conversationId (first message of new chat) */
  onConversationCreated?: (conversationId: string) => void;
  /** Called after each completed assistant reply so the memory panel can refresh */
  onReplyComplete?: () => void;
}

function newId() {
  return crypto.randomUUID();
}

function sourcesFromSteps(steps?: AgentEvent[] | null): { title: string; url: string }[] {
  if (!steps) return [];
  const sources: { title: string; url: string }[] = [];
  for (const step of steps) {
    if (step.type === "tool_end" && step.tool === "web_search" && !step.error) {
      const output = step.output as { results?: { title: string; url: string }[] } | null;
      if (output?.results) sources.push(...output.results.map((r) => ({ title: r.title, url: r.url })));
    }
  }
  return sources;
}

function suggestionsFromSteps(steps?: AgentEvent[] | null): string[] {
  if (!steps) return [];
  const found = steps.find((s) => s.type === "suggestions") as { type: "suggestions"; suggestions: string[] } | undefined;
  return found?.suggestions ?? [];
}

function historyToMessage(m: ChatMessage) {
  return {
    id: newId(),
    role: m.role,
    content: m.content,
    sources: sourcesFromSteps(m.agent_steps),
    suggestions: suggestionsFromSteps(m.agent_steps),
  };
}

/**
 * Main chat window: renders message list + input bar.
 * Manages SSE streaming and incremental AgentThoughts updates.
 */
export default function ChatWindow({
  userId,
  initialConversationId,
  onConversationCreated,
  onReplyComplete,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load history when opening an existing conversation
  useEffect(() => {
    if (!initialConversationId) return;
    fetchMessages(userId, initialConversationId)
      .then((history) => {
        setMessages(history.map(historyToMessage));
      })
      .catch(() => {
        // silently ignore — user can still send new messages
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    // Append user bubble
    const userMsgId = newId();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text },
    ]);

    // Placeholder for streaming assistant reply
    const assistantMsgId = newId();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", steps: [], streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    // Local accumulator to avoid stale-closure issues
    let textAccum = "";
    const stepsMap = new Map<string, ToolStep>();
    let stepOrder: string[] = [];

    try {
      await streamChat(
        userId,
        text,
        conversationId,
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
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: textAccum } : m,
                ),
              );
              break;
            }

            case "tool_start": {
              const stepId = `step-${stepsMap.size}`;
              const step: ToolStep = {
                id: stepId,
                tool: event.tool,
                input: event.input,
                pending: true,
              };
              stepsMap.set(stepId, step);
              stepOrder = [...stepOrder, stepId];

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, steps: Array.from(stepsMap.values()) }
                    : m,
                ),
              );
              break;
            }

            case "tool_end": {
              // Find the last pending step for this tool
              const pendingKey = Array.from(stepsMap.entries())
                .reverse()
                .find(([, s]) => s.tool === event.tool && s.pending)?.[0];
              if (pendingKey) {
                const existing = stepsMap.get(pendingKey)!;
                stepsMap.set(pendingKey, {
                  ...existing,
                  output: event.output,
                  error: event.error,
                  pending: false,
                });
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, steps: Array.from(stepsMap.values()) }
                    : m,
                ),
              );
              break;
            }

            case "sources": {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, sources: event.sources } : m,
                ),
              );
              break;
            }

            case "suggestions": {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, suggestions: event.suggestions } : m,
                ),
              );
              break;
            }

            case "done": {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, streaming: false } : m,
                ),
              );
              break;
            }
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Error: ${errMsg}`, streaming: false }
            : m,
        ),
      );
    } finally {
      setLoading(false);
      onReplyComplete?.();
    }
  }, [input, loading, userId, conversationId, onConversationCreated, onReplyComplete]);

  const handleSuggestionClick = useCallback((text: string) => {
    setInput(text);
  }, []);

  const suggestions = useMemo(() => getRandomSuggestions(5), []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
            <p className="text-2xl mb-2">✈️</p>
            <p className="text-sm font-medium">Ready to plan your perfect trip?</p>
            <p className="text-xs mt-1">Ask me about destinations, visas, weather, hotels…</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onSuggestionClick={handleSuggestionClick} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        {/* Starter suggestions — shown only in an empty chat */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestionClick(s)}
                className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3 max-w-full">
          <textarea
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] max-h-32 scrollbar-thin"
            placeholder="Ask me to plan a trip…  (Shift+Enter for new line)"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
            className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

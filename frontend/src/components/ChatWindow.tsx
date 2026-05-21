"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Paperclip, X, FileText } from "lucide-react";
import MessageBubble, { type Message } from "./MessageBubble";
import { getRandomSuggestions } from "../data/starterSuggestions";
import { type AgentType } from "./AgentSelector";
import { streamChat, fetchMessages, type AgentEvent, type ChatMessage, type Attachment } from "@/lib/api";
import { type ToolStep } from "./AgentThoughts";

interface ChatWindowProps {
  userId: string;
  /** Pre-selected conversation to load/continue */
  initialConversationId?: string | null;
  /** Which agent backend to use */
  agentType?: AgentType;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const BINARY_MIME_TYPES = ["application/pdf"];
const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json"];

function isTextFile(file: File): boolean {
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function isBinaryAttachment(file: File): boolean {
  return file.type.startsWith("image/") || BINARY_MIME_TYPES.includes(file.type);
}

/** Reads a file as base64 (data URI → strip prefix). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Reads a file as UTF-8 text. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

interface PendingTextFile {
  name: string;
  content: string;
}

/**
 * Main chat window: renders message list + input bar.
 * Manages SSE streaming and incremental AgentThoughts updates.
 */
export default function ChatWindow({
  userId,
  initialConversationId,
  agentType = "travel",
  onConversationCreated,
  onReplyComplete,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [textFiles, setTextFiles] = useState<PendingTextFile[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    // Reset input so the same file can be re-selected
    e.target.value = "";

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        alert(`"${file.name}" is ${formatBytes(file.size)} — files over 5 MB may be slow to process.`);
      }

      if (isBinaryAttachment(file)) {
        const base64 = await readAsBase64(file);
        setAttachments((prev) => [...prev, { name: file.name, mimeType: file.type, base64, size: file.size }]);
      } else if (isTextFile(file)) {
        const content = await readAsText(file);
        setTextFiles((prev) => [...prev, { name: file.name, content }]);
      }
    }
  }, []);

  const removeAttachment = useCallback((name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }, []);

  const removeTextFile = useCallback((name: string) => {
    setTextFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const hasContent = text || attachments.length > 0 || textFiles.length > 0;
    if (!hasContent || loading) return;

    // Prepend text file contents to the message string
    let fullText = text;
    for (const tf of textFiles) {
      fullText = `[File: ${tf.name}]\n${tf.content}\n---\n${fullText}`;
    }

    const pendingAttachments = [...attachments];

    setInput("");
    setAttachments([]);
    setTextFiles([]);
    setLoading(true);

    // Build display label for user bubble
    const displayText = [
      text,
      ...attachments.map((a) => `📎 ${a.name}`),
      ...textFiles.map((f) => `📄 ${f.name}`),
    ].filter(Boolean).join("\n");

    // Append user bubble
    const userMsgId = newId();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: displayText },
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
        fullText,
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
        agentType,
        pendingAttachments.length > 0 ? pendingAttachments : undefined,
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
  }, [input, attachments, textFiles, loading, userId, conversationId, agentType, onConversationCreated, onReplyComplete]);

  const handleSuggestionClick = useCallback((text: string) => {
    setInput(text);
  }, []);

  const suggestions = useMemo(() => getRandomSuggestions(6, agentType), [agentType]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const hasContent = input.trim() || attachments.length > 0 || textFiles.length > 0;

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

        {/* Attachment previews */}
        {(attachments.length > 0 || textFiles.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att) => (
              <div key={att.name} className="relative flex items-center gap-1.5 bg-gray-100 rounded-lg px-2 py-1 text-xs text-gray-700 max-w-[180px]">
                {att.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:${att.mimeType};base64,${att.base64}`}
                    alt={att.name}
                    className="h-8 w-8 object-cover rounded"
                  />
                ) : (
                  <FileText size={16} className="text-red-500 shrink-0" />
                )}
                <span className="truncate">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.name)}
                  className="ml-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {textFiles.map((tf) => (
              <div key={tf.name} className="relative flex items-center gap-1.5 bg-gray-100 rounded-lg px-2 py-1 text-xs text-gray-700 max-w-[180px]">
                <FileText size={16} className="text-blue-500 shrink-0" />
                <span className="truncate">{tf.name}</span>
                <button
                  onClick={() => removeTextFile(tf.name)}
                  className="ml-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label={`Remove ${tf.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 max-w-full">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          {/* Paperclip button */}
          <button
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="h-11 w-11 rounded-xl border border-gray-300 text-gray-500 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Paperclip size={18} />
          </button>
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
            aria-label="Send"
            onClick={() => void sendMessage()}
            disabled={loading || !hasContent}
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

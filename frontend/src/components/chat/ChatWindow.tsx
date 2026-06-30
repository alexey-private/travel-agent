"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Paperclip, X, FileText, Mic, Square } from "lucide-react";
import MessageBubble from "./MessageBubble";
import { getRandomSuggestions } from "@/data/starterSuggestions";
import { type AgentType } from "../shared/AgentSelector";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useFileAttachments } from "@/hooks/useFileAttachments";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";

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

/**
 * Main chat window: renders message list + input bar.
 * Streaming, file attachments, and history loading are handled by dedicated hooks.
 */
export default function ChatWindow({
  userId,
  initialConversationId,
  agentType = "travel",
  onConversationCreated,
  onReplyComplete,
}: ChatWindowProps) {
  const { messages, dispatch } = useChatHistory(userId, initialConversationId);
  const { loading, send } = useStreamChat({
    userId,
    agentType,
    initialConversationId,
    onConversationCreated,
    onReplyComplete,
    dispatch,
  });
  const {
    attachments,
    textFiles,
    handleFileChange,
    removeAttachment,
    removeTextFile,
    clearAll,
    buildMessageText,
    buildDisplayLabel,
  } = useFileAttachments();

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { voiceState, toggleRecording } = useVoiceRecording((text) => {
    void send(text, text, []);
  });

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const hasContent = text || attachments.length > 0 || textFiles.length > 0;
    if (!hasContent || loading) return;

    const displayText = buildDisplayLabel(text);
    const fullText = buildMessageText(text);
    const pendingAttachments = [...attachments];

    setInput("");
    clearAll();

    await send(displayText, fullText, pendingAttachments);
  }, [input, attachments, textFiles, loading, buildDisplayLabel, buildMessageText, clearAll, send]);

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
            <p className="text-2xl mb-2">{agentType === "shopping" ? "🛒" : "✈️"}</p>
            <p className="text-sm font-medium">
              {agentType === "shopping" ? "Ready to help you shop?" : "Ready to plan your perfect trip?"}
            </p>
            <p className="text-xs mt-1">
              {agentType === "shopping"
                ? "Ask me about products, prices, reviews, deals…"
                : "Ask me about destinations, visas, weather, hotels…"}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} userId={userId} agentType={agentType} onSuggestionClick={handleSuggestionClick} />
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
              <div
                key={att.name}
                className="relative flex items-center gap-1.5 bg-gray-100 rounded-lg px-2 py-1 text-xs text-gray-700 max-w-[180px]"
              >
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
              <div
                key={tf.name}
                className="relative flex items-center gap-1.5 bg-gray-100 rounded-lg px-2 py-1 text-xs text-gray-700 max-w-[180px]"
              >
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
          {/* Microphone button */}
          <button
            aria-label={voiceState === "recording" ? "Stop recording" : "Record voice message"}
            onClick={toggleRecording}
            disabled={loading || voiceState === "transcribing"}
            className={`h-11 w-11 rounded-xl border flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              voiceState === "recording"
                ? "border-red-400 bg-red-50 text-red-500 hover:bg-red-100"
                : "border-gray-300 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {voiceState === "transcribing" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : voiceState === "recording" ? (
              <Square size={18} className="fill-red-500" />
            ) : (
              <Mic size={18} />
            )}
          </button>
          <textarea
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] max-h-32 scrollbar-thin"
            placeholder={
              agentType === "shopping"
                ? "Ask me about products…  (Shift+Enter for new line)"
                : "Ask me to plan a trip…  (Shift+Enter for new line)"
            }
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
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

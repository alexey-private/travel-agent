"use client";

import AgentThoughts, { type ToolStep } from "./AgentThoughts";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tool-use steps attached to this assistant message */
  steps?: ToolStep[];
  /** True while the assistant is still streaming */
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
}

/**
 * Renders a single chat message bubble.
 * Assistant messages include an optional AgentThoughts section.
 */
export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? "order-1" : "order-2"}`}>
        {/* Role label */}
        <p className={`text-xs text-gray-400 mb-1 ${isUser ? "text-right" : "text-left"}`}>
          {isUser ? "You" : "Travel Agent"}
        </p>

        {/* Agent thoughts (tool calls) — only for assistant */}
        {!isUser && (message.steps?.length ?? 0) > 0 && (
          <AgentThoughts
            steps={message.steps ?? []}
            streaming={message.streaming ?? false}
          />
        )}

        {/* Streaming "thinking" indicator before any text arrives */}
        {!isUser && message.streaming && !message.content && (message.steps?.length ?? 0) === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-200 shadow-sm">
            <span className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {/* Bubble text */}
        {message.content && (
          <div
            className={`px-4 py-3 rounded-2xl shadow-sm whitespace-pre-wrap text-sm leading-relaxed ${
              isUser
                ? "bg-blue-600 text-white rounded-tr-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
            }`}
          >
            {message.content}
            {/* Blinking cursor while streaming text */}
            {!isUser && message.streaming && (
              <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

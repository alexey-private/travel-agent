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
  /** Web sources cited by the agent */
  sources?: { title: string; url: string }[];
  /** Suggested follow-up questions */
  suggestions?: string[];
}

interface MessageBubbleProps {
  message: Message;
  onSuggestionClick?: (text: string) => void;
}

/**
 * Renders a single chat message bubble.
 * Assistant messages include an optional AgentThoughts section.
 */
export default function MessageBubble({ message, onSuggestionClick }: MessageBubbleProps) {
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

        {/* Sources */}
        {!isUser && (message.sources?.length ?? 0) > 0 && (
          <div className="mt-1.5 px-1">
            <p className="text-xs text-gray-400 font-medium mb-1">Sources</p>
            <ul className="space-y-0.5">
              {message.sources!.map((s, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-gray-300 text-xs mt-0.5">↗</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline line-clamp-1"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Follow-up suggestions */}
        {!isUser && !message.streaming && (message.suggestions?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.suggestions!.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick?.(s)}
                className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

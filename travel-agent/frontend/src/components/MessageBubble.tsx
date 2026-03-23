"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
            className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
              isUser
                ? "bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap"
                : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
            }`}
          >
            {isUser ? (
              message.content
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
                  code: ({ children }) => <code className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-600 my-2">{children}</blockquote>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>,
                  hr: () => <hr className="border-gray-200 my-2" />,
                  table: ({ children }) => <table className="text-xs border-collapse w-full my-2">{children}</table>,
                  th: ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-semibold text-left">{children}</th>,
                  td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
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

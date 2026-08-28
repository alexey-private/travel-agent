"use client";

import { memo, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Download, HardDrive } from "lucide-react";
import AgentThoughts from "./AgentThoughts";
import { exportToPdf, exportToPdfDrive, derivePdfFilename } from "@/lib/api";
import { type Message } from "@/types/agent";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/dictionaries";

export type { Message };

interface MessageBubbleProps {
  message: Message;
  userId?: string;
  agentType?: "travel" | "shopping";
  onSuggestionClick?: (text: string) => void;
}

const SOURCES_PREVIEW = 5;

const MessageBubble = memo(function MessageBubble({ message, userId, agentType = "travel", onSuggestionClick }: MessageBubbleProps) {
  const t = useT();
  const isUser = message.role === "user";
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [driveStatus, setDriveStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleDownloadLocal() {
    setMenuOpen(false);
    setExporting(true);
    try {
      const filename = derivePdfFilename(message.content, message.createdAt);
      await exportToPdf(message.content, filename);
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveToDrive() {
    setMenuOpen(false);
    if (!userId) return;
    setDriveStatus("uploading");
    setDriveError(null);
    try {
      const filename = derivePdfFilename(message.content, message.createdAt);
      const result = await exportToPdfDrive(message.content, userId, agentType, filename);
      setDriveLink(result.webViewLink);
      setDriveStatus("done");
    } catch (err) {
      // ApiError.message is a dictionary key; translate() passes anything
      // it does not recognise straight through, so raw prose survives too.
      setDriveError(err instanceof Error ? t(err.message as TKey) : t("chat.uploadFailed"));
      setDriveStatus("error");
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? "order-1" : "order-2"}`}>
        {/* Role label */}
        <p className={`text-xs text-gray-400 mb-1 ${isUser ? "text-right" : "text-left"}`}>
          {isUser ? t("chat.roleYou") : t("chat.roleAgent")}
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
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-200 shadow-xs">
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
            className={`px-4 py-3 rounded-2xl shadow-xs text-sm leading-relaxed ${
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
                  code: ({ children }) => <code className="bg-gray-100 rounded-sm px-1 py-0.5 text-xs font-mono">{children}</code>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-600 my-2">{children}</blockquote>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>,
                  hr: () => <hr className="border-gray-200 my-2" />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2 -mx-1">
                      <table className="text-xs border-collapse w-full">{children}</table>
                    </div>
                  ),
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

        {/* Export to PDF — shown for completed assistant messages with content */}
        {!isUser && !message.streaming && message.content && (
          <div className="mt-1 flex justify-end items-center gap-2">
            {/* Drive status feedback */}
            {driveStatus === "uploading" && (
              <span className="text-xs text-gray-400">{t("chat.uploading")}</span>
            )}
            {driveStatus === "done" && driveLink && (
              <a
                href={driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-green-600 hover:underline"
              >
                <HardDrive size={12} />
                {t("chat.savedToDrive")}
              </a>
            )}
            {driveStatus === "error" && (
              <span className="text-xs text-red-400" title={driveError ?? undefined}>{t("chat.uploadFailed")}</span>
            )}

            {/* PDF dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                disabled={exporting || driveStatus === "uploading"}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                title={t("chat.downloadAsPdf")}
              >
                <Download size={12} />
                {exporting ? t("chat.exporting") : t("chat.pdf")}
                <ChevronDown size={10} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[170px] py-1">
                  <button
                    onClick={handleDownloadLocal}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Download size={12} />
                    {t("chat.downloadLocally")}
                  </button>
                  <button
                    onClick={handleSaveToDrive}
                    disabled={!userId}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    <HardDrive size={12} />
                    {t("chat.saveToDrive")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sources */}
        {!isUser && (message.sources?.length ?? 0) > 0 && (
          <div className="mt-1.5 px-1">
            <p className="text-xs text-gray-400 font-medium mb-1">{t("chat.sources")}</p>
            <ul className="space-y-0.5">
              {message.sources!.slice(0, SOURCES_PREVIEW).map((s, i) => (
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
              {sourcesExpanded &&
                message.sources!.slice(SOURCES_PREVIEW).map((s, i) => (
                  <li key={SOURCES_PREVIEW + i} className="flex items-start gap-1">
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
            {message.sources!.length > SOURCES_PREVIEW && (
              <button
                onClick={() => setSourcesExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-1"
              >
                {sourcesExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {sourcesExpanded
                  ? t("chat.showLess")
                  : t("chat.showMore", { count: message.sources!.length - SOURCES_PREVIEW })}
              </button>
            )}
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
});

export default MessageBubble;

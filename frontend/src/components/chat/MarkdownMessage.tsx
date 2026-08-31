"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * An assistant reply, rendered as markdown.
 *
 * Its own module so that `react-markdown` and `remark-gfm` — 42 KB gzipped, a
 * sixth of what the app downloads before it can show anything — are a chunk of
 * their own rather than part of the first load. Nothing needs them
 * synchronously: `/` renders a spinner until the session id resolves, so no
 * markdown is parsed until well after mount, and `MessageBubble` waits behind a
 * `Suspense` whose fallback is the same text unformatted.
 */
export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc ps-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal ps-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
        // Code is left-to-right in every language — the same rule the PDF export
        // follows. Inside an rtl bubble it would otherwise right-align and
        // shuffle its punctuation.
        code: ({ children }) => <code dir="ltr" className="bg-gray-100 rounded-sm px-1 py-0.5 text-xs font-mono">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-s-2 border-gray-300 ps-3 text-gray-600 my-2">{children}</blockquote>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>,
        hr: () => <hr className="border-gray-200 my-2" />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 -mx-1">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-semibold text-start">{children}</th>,
        td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

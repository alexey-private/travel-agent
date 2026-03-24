import React from "react";

// Minimal mock: renders children as plain text so Jest (CJS) doesn't choke on
// react-markdown's ESM-only build.
export default function ReactMarkdown({ children }: { children: string }) {
  return <span>{children}</span>;
}

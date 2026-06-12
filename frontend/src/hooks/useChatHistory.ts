"use client";

import { useEffect, useState } from "react";
import { fetchMessages } from "@/lib/api";
import { type Message, type AgentEvent } from "@/types/agent";

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

export function useChatHistory(
  userId: string,
  initialConversationId: string | null | undefined,
): { messages: Message[]; setMessages: React.Dispatch<React.SetStateAction<Message[]>> } {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!initialConversationId) return;
    fetchMessages(userId, initialConversationId)
      .then((history) => {
        setMessages(
          history.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            sources: sourcesFromSteps(m.agent_steps),
            suggestions: suggestionsFromSteps(m.agent_steps),
          })),
        );
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { messages, setMessages };
}

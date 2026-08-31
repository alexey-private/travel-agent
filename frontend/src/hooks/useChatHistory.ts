"use client";

import { useEffect, useReducer } from "react";
import { fetchMessages } from "@/lib/api";
import { type Message, type MessagesAction, type ToolStep, type AgentEvent } from "@/types/agent";

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

export function messagesReducer(state: Message[], action: MessagesAction): Message[] {
  switch (action.type) {
    case "RESET":
      return action.messages;
    case "ADD":
      return [...state, action.message];
    case "STREAM_TEXT":
      return state.map((m) => m.id === action.id ? { ...m, content: m.content + action.chunk } : m);
    case "TOOL_START":
      return state.map((m) => {
        if (m.id !== action.id) return m;
        const existing = m.steps ?? [];
        const step: ToolStep = { id: `step-${existing.length}`, tool: action.tool, input: action.input, pending: true };
        return { ...m, steps: [...existing, step] };
      });
    case "TOOL_END":
      return state.map((m) => {
        if (m.id !== action.id) return m;
        const steps = [...(m.steps ?? [])];
        let lastIdx = -1;
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i].tool === action.tool && steps[i].pending) { lastIdx = i; break; }
        }
        if (lastIdx !== -1) {
          steps[lastIdx] = { ...steps[lastIdx], output: action.output, error: action.error, pending: false };
        }
        return { ...m, steps };
      });
    case "SET_SOURCES":
      return state.map((m) => m.id === action.id ? { ...m, sources: action.sources } : m);
    case "SET_SUGGESTIONS":
      return state.map((m) => m.id === action.id ? { ...m, suggestions: action.suggestions } : m);
    case "MARK_DONE":
      return state.map((m) => m.id === action.id ? { ...m, streaming: false } : m);
    // A failure can arrive after the reply has already started. Replacing the
    // content would then delete an answer the user was reading — so the notice
    // goes under whatever arrived, and only stands alone when nothing did.
    case "MARK_ERROR":
      return state.map((m) => m.id === action.id
        ? { ...m, content: m.content ? `${m.content}\n\n${action.error}` : action.error, streaming: false }
        : m);
    default:
      return state;
  }
}

export function useChatHistory(
  userId: string,
  initialConversationId: string | null | undefined,
): { messages: Message[]; dispatch: React.Dispatch<MessagesAction> } {
  const [messages, dispatch] = useReducer(messagesReducer, []);

  useEffect(() => {
    if (!initialConversationId) return;
    let ignore = false;
    fetchMessages(userId, initialConversationId)
      .then((history) => {
        if (ignore) return;
        dispatch({
          type: "RESET",
          messages: history.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
            sources: sourcesFromSteps(m.agent_steps),
            suggestions: suggestionsFromSteps(m.agent_steps),
          })),
        });
      })
      .catch(() => {});
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { messages, dispatch };
}

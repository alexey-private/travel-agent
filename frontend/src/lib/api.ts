import { API_URL } from "./config";
import { type Attachment, type AgentEvent, type Conversation, type UserMemory, type ChatMessage } from "@/types/agent";

export type { Attachment, AgentEvent, Conversation, UserMemory, ChatMessage } from "@/types/agent";

/**
 * Stream a chat message to the backend via SSE (POST + ReadableStream).
 * Calls onEvent for each parsed SSE event until the stream closes.
 */
export async function streamChat(
  userId: string,
  message: string,
  conversationId: string | null,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
  agentType?: "travel" | "shopping",
  attachments?: Attachment[],
): Promise<void> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, message, conversationId, agentType, attachments }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines from the buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const event = JSON.parse(data) as AgentEvent;
          onEvent(event);
        } catch {
          // Ignore malformed lines
        }
      }
    }
  }
}

/** Fetch all stored memories for a user filtered by agent type. */
export async function fetchMemories(userId: string, agentType: "travel" | "shopping" = "travel"): Promise<UserMemory[]> {
  const response = await fetch(`${API_URL}/api/memory/${userId}?agentType=${agentType}`);
  if (!response.ok) throw new Error(`Failed to fetch memories: ${response.status}`);
  const data = (await response.json()) as { memories: UserMemory[] };
  return data.memories;
}

/** Delete a single memory entry for a user. */
export async function deleteMemory(userId: string, key: string, agentType: "travel" | "shopping" = "travel"): Promise<void> {
  await fetch(`${API_URL}/api/memory/${userId}/${encodeURIComponent(key)}?agentType=${agentType}`, {
    method: "DELETE",
  });
}

/** Fetch messages for a specific conversation. */
export async function fetchMessages(
  userId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  const response = await fetch(
    `${API_URL}/api/conversations/${userId}/${conversationId}/messages`,
  );
  if (!response.ok) throw new Error(`Failed to fetch messages: ${response.status}`);
  const data = (await response.json()) as { messages: ChatMessage[] };
  return data.messages;
}

/** Delete a conversation and all its messages. */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/conversations/${userId}/${conversationId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
}

/** Clear all messages from a conversation (keeps the conversation). */
export async function clearConversationMessages(userId: string, conversationId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/conversations/${userId}/${conversationId}/messages`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to clear messages: ${res.status}`);
}

/** Fetch all conversations for a user filtered by agent type, newest first. */
export async function fetchConversations(userId: string, agentType: "travel" | "shopping" = "travel"): Promise<Conversation[]> {
  const response = await fetch(`${API_URL}/api/conversations/${userId}?agentType=${agentType}`);
  if (!response.ok) throw new Error(`Failed to fetch conversations: ${response.status}`);
  const data = (await response.json()) as { conversations: Conversation[] };
  return data.conversations;
}

/** Check if user has connected Google Calendar. */
export async function fetchGoogleCalendarStatus(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/google/status?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { connected: boolean };
    return data.connected;
  } catch {
    return false;
  }
}

/** Disconnect Google Calendar for a user. */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  await fetch(`${API_URL}/auth/google/disconnect?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

/** Derive a human-readable PDF filename from message content: "2026-06-30 Flights New York London" */
export function derivePdfFilename(text: string, createdAt?: string): string {
  const date = (createdAt ? new Date(createdAt) : new Date()).toISOString().split('T')[0];

  // Find the first H1–H3 heading in the markdown
  const match = text.match(/^#{1,3}\s+(.+)/m);
  if (match) {
    const heading = match[1]
      .replace(/[*#`_~[\]()]/g, '')                          // strip markdown syntax
      .replace(/[^\w\sÀ-ɏЀ-ӿ]/g, ' ')   // keep latin, cyrillic, digits
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    if (heading.length > 3) return `${date} ${heading}`;
  }

  // Fallback: first non-empty line of plain text
  const firstLine = text.split('\n').map(l => l.replace(/^[#>\-*\d.\s]+/, '').trim()).find(l => l.length > 5);
  if (firstLine) {
    const name = firstLine
      .replace(/[*#`_~[\]()]/g, '')
      .replace(/[^\w\sÀ-ɏЀ-ӿ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    if (name.length > 3) return `${date} ${name}`;
  }

  return `agent-response-${date}`;
}

/** Download an assistant message as a PDF file. */
export async function exportToPdf(text: string, filename?: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, filename }),
  });
  if (!response.ok) throw new Error(`Export failed: ${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename ?? 'agent-response'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload an assistant message as a PDF to Google Drive. Returns the file link. */
export async function exportToPdfDrive(
  text: string,
  userId: string,
  agentType: 'travel' | 'shopping',
  filename?: string,
): Promise<{ webViewLink: string; name: string }> {
  const response = await fetch(`${API_URL}/api/export/pdf-to-drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, userId, agentType, filename }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Export failed: ${response.status}`);
  }
  return response.json();
}

/** Generate or retrieve a persistent userId from localStorage. */
export function getOrCreateUserId(): string {
  const stored = localStorage.getItem("travel_agent_user_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("travel_agent_user_id", id);
  return id;
}

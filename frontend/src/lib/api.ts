const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface Attachment {
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

export type AgentEvent =
  | { type: "conversation_id"; conversationId: string }
  | { type: "text"; content: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; tool: string; output: unknown; error?: string }
  | { type: "sources"; sources: { title: string; url: string }[] }
  | { type: "suggestions"; suggestions: string[] }
  | { type: "done" };

export interface Conversation {
  id: string;
  created_at: string;
  title: string | null;
}

export interface UserMemory {
  key: string;
  value: string;
}

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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  agent_steps?: AgentEvent[] | null;
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

/** Generate or retrieve a persistent userId from localStorage. */
export function getOrCreateUserId(): string {
  const stored = localStorage.getItem("travel_agent_user_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("travel_agent_user_id", id);
  return id;
}

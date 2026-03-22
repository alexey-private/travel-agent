const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type AgentEvent =
  | { type: "conversation_id"; conversationId: string }
  | { type: "text"; content: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; tool: string; output: unknown; error?: string }
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
): Promise<void> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, message, conversationId }),
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

/** Fetch all stored memories for a user. */
export async function fetchMemories(userId: string): Promise<UserMemory[]> {
  const response = await fetch(`${API_URL}/api/memory/${userId}`);
  if (!response.ok) throw new Error(`Failed to fetch memories: ${response.status}`);
  const data = (await response.json()) as { memories: UserMemory[] };
  return data.memories;
}

/** Delete a single memory entry for a user. */
export async function deleteMemory(userId: string, key: string): Promise<void> {
  await fetch(`${API_URL}/api/memory/${userId}/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

/** Fetch all conversations for a user, newest first. */
export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const response = await fetch(`${API_URL}/api/conversations/${userId}`);
  if (!response.ok) throw new Error(`Failed to fetch conversations: ${response.status}`);
  const data = (await response.json()) as { conversations: Conversation[] };
  return data.conversations;
}

/** Generate or retrieve a persistent userId from localStorage. */
export function getOrCreateUserId(): string {
  const stored = localStorage.getItem("travel_agent_user_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("travel_agent_user_id", id);
  return id;
}

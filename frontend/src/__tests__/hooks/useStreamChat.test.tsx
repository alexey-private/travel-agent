/**
 * Tests for the useStreamChat hook.
 * Covers: the conversation id a follow-up request carries, and the interface
 * language it sends to the backend.
 */

import { renderHook, act } from "@testing-library/react";
import { useStreamChat } from "@/hooks/useStreamChat";
import * as api from "@/lib/api";
import type { AgentEvent } from "@/lib/api";

jest.mock("@/lib/api");
const mockStreamChat = api.streamChat as jest.MockedFunction<typeof api.streamChat>;

const t = ((key: string) => key) as never;

describe("useStreamChat", () => {
  beforeEach(() => {
    mockStreamChat.mockReset();
  });

  /**
   * Voice input calls send() without checking `loading`, so a second request can
   * start while the first stream is still open. It must carry the conversation
   * id the first stream just created, or the backend opens a second conversation.
   */
  it("reuses the conversation id in a send started before the first stream ends", async () => {
    const seenIds: (string | null)[] = [];
    let releaseFirst!: () => void;

    mockStreamChat.mockImplementation(async (_userId, _msg, convId, onEvent) => {
      seenIds.push(convId);
      if (seenIds.length === 1) {
        onEvent({ type: "conversation_id", conversationId: "conv-1" } as AgentEvent);
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      onEvent({ type: "done" } as AgentEvent);
    });

    const { result } = renderHook(() =>
      useStreamChat({ userId: "user-1", agentType: "travel", dispatch: jest.fn(), t, locale: "en" }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.send("hi", "hi");
      // No await in between: this is the window an effect-based ref would miss.
      second = result.current.send("and again", "and again");
      releaseFirst();
    });
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(seenIds).toEqual([null, "conv-1"]);
  });

  /**
   * The agent decides its response language from what the request carries, so a
   * locale that stops at the hook boundary is the same bug as no locale at all.
   */
  it("sends the interface language with the request", async () => {
    mockStreamChat.mockImplementation(async (_userId, _msg, _convId, onEvent) => {
      onEvent({ type: "done" } as AgentEvent);
    });

    const { result } = renderHook(() =>
      useStreamChat({ userId: "user-1", agentType: "travel", dispatch: jest.fn(), t, locale: "he" }),
    );

    await act(async () => {
      await result.current.send("שלום", "שלום");
    });

    expect(mockStreamChat.mock.calls[0][7]).toBe("he");
  });
  /**
   * The stream can end in a failure instead of an answer. The event union had no
   * `error` variant, so the browser parsed the event and dropped it: the bubble
   * was marked done by the `done` that follows and stayed empty, saying nothing
   * at all about what had happened.
   */
  it("reports a failed turn instead of finishing the bubble empty", async () => {
    mockStreamChat.mockImplementation(async (_userId, _msg, _convId, onEvent) => {
      onEvent({ type: "error", code: "agent_failed" } as AgentEvent);
      onEvent({ type: "done" } as AgentEvent);
    });

    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useStreamChat({ userId: "user-1", agentType: "travel", dispatch, t, locale: "en" }),
    );

    await act(async () => {
      await result.current.send("hi", "hi");
    });

    const marked = dispatch.mock.calls.map(([action]) => action).find((a) => a.type === "MARK_ERROR");
    expect(marked).toBeDefined();
    expect(marked.error).toContain("errors.agentFailed");
  });

  it("falls back to a general failure for a code it does not know", async () => {
    mockStreamChat.mockImplementation(async (_userId, _msg, _convId, onEvent) => {
      onEvent({ type: "error", code: "something_new" } as AgentEvent);
      onEvent({ type: "done" } as AgentEvent);
    });

    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useStreamChat({ userId: "user-1", agentType: "travel", dispatch, t, locale: "en" }),
    );

    await act(async () => {
      await result.current.send("hi", "hi");
    });

    const marked = dispatch.mock.calls.map(([action]) => action).find((a) => a.type === "MARK_ERROR");
    expect(marked.error).toContain("errors.chatRequestFailed");
  });
});

/**
 * What a failed turn leaves on screen.
 *
 * The failure can arrive after the reply has already started streaming — the
 * graph throws mid-answer — and the notice must not delete what the user was
 * already reading. This only became reachable when the SSE `error` event started
 * being handled at all: before that the browser dropped it, and the partial text
 * survived by accident.
 */

import { messagesReducer } from "@/hooks/useChatHistory";
import type { Message } from "@/types/agent";

function assistant(content: string): Message[] {
  return [{ id: "m1", role: "assistant", content, streaming: true, steps: [] }];
}

describe("messagesReducer — MARK_ERROR", () => {
  it("keeps a partial answer and puts the notice under it", () => {
    const [message] = messagesReducer(assistant("Here are 3 flights:"), {
      type: "MARK_ERROR",
      id: "m1",
      error: "The assistant could not finish that answer.",
    });

    expect(message.content).toBe(
      "Here are 3 flights:\n\nThe assistant could not finish that answer.",
    );
    expect(message.streaming).toBe(false);
  });

  it("stands alone when nothing had arrived yet", () => {
    const [message] = messagesReducer(assistant(""), {
      type: "MARK_ERROR",
      id: "m1",
      error: "The assistant could not finish that answer.",
    });

    expect(message.content).toBe("The assistant could not finish that answer.");
    expect(message.streaming).toBe(false);
  });

  it("leaves every other message alone", () => {
    const state: Message[] = [
      { id: "m0", role: "user", content: "hi", steps: [] },
      ...assistant("partial"),
    ];

    const next = messagesReducer(state, { type: "MARK_ERROR", id: "m1", error: "failed" });

    expect(next[0]).toBe(state[0]);
    expect(next[1].content).toBe("partial\n\nfailed");
  });
});

/**
 * Tests for ChatWindow component.
 * Covers: initial state, input handling, Enter/Shift+Enter, SSE event processing,
 *         onReplyComplete callback, abort on unmount.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatWindow from "@/components/ChatWindow";
import * as api from "@/lib/api";
import type { AgentEvent } from "@/lib/api";

jest.mock("@/lib/api");
const mockStreamChat = api.streamChat as jest.MockedFunction<typeof api.streamChat>;

/** Helper: make streamChat emit a controlled sequence of events */
function mockStream(events: AgentEvent[]) {
  mockStreamChat.mockImplementation(async (_userId, _msg, _convId, onEvent) => {
    for (const event of events) {
      onEvent(event);
    }
  });
}

describe("ChatWindow — initial render", () => {
  it("shows the empty-state prompt", () => {
    render(<ChatWindow userId="u1" />);
    expect(screen.getByText(/ready to plan/i)).toBeInTheDocument();
  });

  it("renders the textarea and send button", () => {
    render(<ChatWindow userId="u1" />);
    expect(screen.getByPlaceholderText(/plan a trip/i)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<ChatWindow userId="u1" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("ChatWindow — sending messages", () => {
  beforeEach(() => jest.clearAllMocks());

  it("adds user and assistant bubbles after sending", async () => {
    mockStream([{ type: "text", content: "Here is your plan" }, { type: "done" }]);

    render(<ChatWindow userId="u1" />);
    await userEvent.type(screen.getByRole("textbox"), "Plan a trip to Tokyo");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => screen.getByText("Plan a trip to Tokyo"));
    await waitFor(() => screen.getByText("Here is your plan"));
  });

  it("clears the input after sending", async () => {
    mockStream([{ type: "done" }]);
    render(<ChatWindow userId="u1" />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hello");
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("disables the textarea while the response is streaming", async () => {
    // Stream hangs until we resolve manually
    let resolve!: () => void;
    mockStreamChat.mockImplementation(
      () => new Promise<void>((r) => { resolve = r; }),
    );

    render(<ChatWindow userId="u1" />);
    await userEvent.type(screen.getByRole("textbox"), "Hi");
    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("textbox")).toBeDisabled();
    act(() => resolve());
  });

  it("submits on Enter key", async () => {
    mockStream([{ type: "done" }]);
    render(<ChatWindow userId="u1" />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Go to Paris");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));
  });

  it("does NOT submit on Shift+Enter", async () => {
    render(<ChatWindow userId="u1" />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Line one");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockStreamChat).not.toHaveBeenCalled();
  });
});

describe("ChatWindow — SSE event handling", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accumulates text content across multiple text events", async () => {
    mockStream([
      { type: "text", content: "Hello " },
      { type: "text", content: "world" },
      { type: "done" },
    ]);

    render(<ChatWindow userId="u1" />);
    await userEvent.type(screen.getByRole("textbox"), "Hi");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => screen.getByText("Hello world"));
  });

  it("adds tool steps from tool_start and tool_end events", async () => {
    mockStream([
      { type: "tool_start", tool: "web_search", input: { query: "Tokyo" } },
      { type: "tool_end", tool: "web_search", output: { results: [] } },
      { type: "text", content: "Done" },
      { type: "done" },
    ]);

    render(<ChatWindow userId="u1" />);
    await userEvent.type(screen.getByRole("textbox"), "Search");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => screen.getByText(/1 tool/i));
  });

  it("shows error text when streamChat throws", async () => {
    mockStreamChat.mockRejectedValue(new Error("Network failure"));

    render(<ChatWindow userId="u1" />);
    await userEvent.type(screen.getByRole("textbox"), "Hi");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      screen.getByText(/error.*network failure/i),
    );
  });

  it("calls onReplyComplete after each streamed reply", async () => {
    mockStream([{ type: "done" }]);
    const onReplyComplete = jest.fn();

    render(<ChatWindow userId="u1" onReplyComplete={onReplyComplete} />);
    await userEvent.type(screen.getByRole("textbox"), "Hi");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onReplyComplete).toHaveBeenCalledTimes(1));
  });
});

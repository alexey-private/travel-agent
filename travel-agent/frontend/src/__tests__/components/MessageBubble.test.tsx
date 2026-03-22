/**
 * Tests for MessageBubble component.
 * Covers: user/assistant alignment, streaming cursor, typing dots, AgentThoughts presence.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import MessageBubble, { type Message } from "@/components/MessageBubble";

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    streaming: false,
    steps: [],
    ...overrides,
  };
}

describe("MessageBubble — user messages", () => {
  it("renders the message text", () => {
    render(<MessageBubble message={makeMessage({ role: "user", content: "Plan a trip" })} />);
    expect(screen.getByText("Plan a trip")).toBeInTheDocument();
  });

  it("shows 'You' label", () => {
    render(<MessageBubble message={makeMessage({ role: "user", content: "Hi" })} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("does not show AgentThoughts for user messages", () => {
    const steps = [{ id: "s1", tool: "web_search", input: {}, pending: false }];
    render(
      <MessageBubble message={makeMessage({ role: "user", content: "Hi", steps })} />,
    );
    // AgentThoughts toggle should not be present
    expect(screen.queryByText(/tool/i)).not.toBeInTheDocument();
  });
});

describe("MessageBubble — assistant messages", () => {
  it("shows 'Travel Agent' label", () => {
    render(<MessageBubble message={makeMessage({ content: "Here is your plan" })} />);
    expect(screen.getByText("Travel Agent")).toBeInTheDocument();
  });

  it("renders assistant text content", () => {
    render(<MessageBubble message={makeMessage({ content: "Here is your plan" })} />);
    expect(screen.getByText("Here is your plan")).toBeInTheDocument();
  });

  it("shows streaming blinking cursor while streaming text", () => {
    render(<MessageBubble message={makeMessage({ content: "Working…", streaming: true })} />);
    // The cursor is a <span> with animate-pulse class
    const cursor = document.querySelector("span.animate-pulse");
    expect(cursor).toBeInTheDocument();
  });

  it("does not show blinking cursor when not streaming", () => {
    render(<MessageBubble message={makeMessage({ content: "Done", streaming: false })} />);
    expect(document.querySelector("span.animate-pulse")).not.toBeInTheDocument();
  });

  it("shows typing dots when streaming with no content and no steps", () => {
    render(<MessageBubble message={makeMessage({ content: "", streaming: true, steps: [] })} />);
    // Three bouncing dots
    const dots = document.querySelectorAll("span.animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("does not show typing dots when content is present", () => {
    render(<MessageBubble message={makeMessage({ content: "Hi", streaming: true })} />);
    expect(document.querySelectorAll("span.animate-bounce")).toHaveLength(0);
  });

  it("renders AgentThoughts when steps are present", () => {
    const steps = [{ id: "s1", tool: "web_search", input: { query: "Tokyo" }, pending: false, output: {} }];
    render(<MessageBubble message={makeMessage({ content: "Done", steps })} />);
    expect(screen.getByText(/1 tool/i)).toBeInTheDocument();
  });
});

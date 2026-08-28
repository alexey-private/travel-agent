/**
 * Tests for MessageBubble component.
 * Covers: user/assistant alignment, streaming cursor, typing dots, AgentThoughts presence.
 */

import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/apiError";
import { renderWithI18n } from "../helpers/renderWithI18n";
import MessageBubble, { type Message } from "@/components/chat/MessageBubble";

jest.mock("@/lib/api", () => ({
  exportToPdf: jest.fn(),
  exportToPdfDrive: jest.fn(),
  derivePdfFilename: () => "agent-response",
}));

const api = require("@/lib/api") as { exportToPdfDrive: jest.Mock };

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
    renderWithI18n(<MessageBubble message={makeMessage({ role: "user", content: "Plan a trip" })} />);
    expect(screen.getByText("Plan a trip")).toBeInTheDocument();
  });

  it("shows 'You' label", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ role: "user", content: "Hi" })} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("does not show AgentThoughts for user messages", () => {
    const steps = [{ id: "s1", tool: "web_search", input: {}, pending: false }];
    renderWithI18n(
      <MessageBubble message={makeMessage({ role: "user", content: "Hi", steps })} />,
    );
    // AgentThoughts toggle should not be present
    expect(screen.queryByText(/tool/i)).not.toBeInTheDocument();
  });
});

describe("MessageBubble — assistant messages", () => {
  it("shows 'Travel Agent' label", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "Here is your plan" })} />);
    expect(screen.getByText("Travel Agent")).toBeInTheDocument();
  });

  it("renders assistant text content", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "Here is your plan" })} />);
    expect(screen.getByText("Here is your plan")).toBeInTheDocument();
  });

  it("shows streaming blinking cursor while streaming text", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "Working…", streaming: true })} />);
    // The cursor is a <span> with animate-pulse class
    const cursor = document.querySelector("span.animate-pulse");
    expect(cursor).toBeInTheDocument();
  });

  it("does not show blinking cursor when not streaming", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "Done", streaming: false })} />);
    expect(document.querySelector("span.animate-pulse")).not.toBeInTheDocument();
  });

  it("shows typing dots when streaming with no content and no steps", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "", streaming: true, steps: [] })} />);
    // Three bouncing dots
    const dots = document.querySelectorAll("span.animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("does not show typing dots when content is present", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "Hi", streaming: true })} />);
    expect(document.querySelectorAll("span.animate-bounce")).toHaveLength(0);
  });

  it("renders AgentThoughts when steps are present", () => {
    const steps = [{ id: "s1", tool: "web_search", input: { query: "Tokyo" }, pending: false, output: {} }];
    renderWithI18n(<MessageBubble message={makeMessage({ content: "Done", steps })} />);
    expect(screen.getByText(/1 tool/i)).toBeInTheDocument();
  });
});

describe("MessageBubble — Drive upload failure", () => {
  // The API layer throws an ApiError whose message is a dictionary key. Three
  // separate surfaces have already leaked such a key straight into the UI, so
  // this pins the translation down where a user can actually see it.
  it("translates the error key instead of showing it raw", async () => {
    api.exportToPdfDrive.mockRejectedValue(new ApiError("errors.exportFailed", 500));

    renderWithI18n(<MessageBubble message={makeMessage({ content: "Trip plan" })} userId="u1" />);

    await userEvent.click(screen.getByRole("button", { name: /pdf/i }));
    await userEvent.click(screen.getByRole("button", { name: /save to google drive/i }));

    const status = await screen.findByText("Upload failed");
    expect(status).toHaveAttribute("title", "Export failed");
    expect(status.getAttribute("title")).not.toContain("errors.");
  });
});

describe("MessageBubble — text direction", () => {
  // The agent follows the language of the message, not the UI setting, so a
  // Hebrew reply can land in an English interface. Only the browser can tell
  // which way a given body reads.
  it("lets the browser pick the direction of an assistant message", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ content: "שלום, מצאתי 3 טיסות" })} />);
    expect(screen.getByText(/שלום/).closest("[dir]")).toHaveAttribute("dir", "auto");
  });

  it("does the same for a user message", () => {
    renderWithI18n(<MessageBubble message={makeMessage({ role: "user", content: "שלום" })} />);
    expect(screen.getByText("שלום").closest("[dir]")).toHaveAttribute("dir", "auto");
  });
});

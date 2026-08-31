/**
 * The markdown renderer is a chunk of its own, and this is what that costs.
 *
 * `react-markdown` and `remark-gfm` are 42 KB gzipped — measured: the first load
 * of `/` goes from 251 KB to 209 KB when they move out of it — and nothing on
 * the critical path parses markdown, so they are imported lazily. The price is a
 * moment before the chunk arrives, and the bubble must show the reply in it
 * rather than nothing.
 *
 * Its own file because the lazy import resolves once per module registry: the
 * second render in a file never sees the fallback again, so an assertion about
 * it in a shared file would pass or fail on test order.
 */

import React from "react";
import { act, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/renderWithI18n";
import MessageBubble, { type Message } from "@/components/chat/MessageBubble";

jest.mock("@/lib/api", () => ({
  exportToPdf: jest.fn(),
  exportToPdfDrive: jest.fn(),
  derivePdfFilename: () => "agent-response",
}));

const message: Message = {
  id: "m1",
  role: "assistant",
  content: "**Rome** in April",
  streaming: false,
  steps: [],
};

describe("MessageBubble — lazy markdown", () => {
  it("shows the reply text while the markdown chunk is still loading", async () => {
    renderWithI18n(<MessageBubble message={message} />);

    // The Suspense fallback: the same text, unformatted. `next/dynamic` cannot
    // do this — its `loading` component is handed no props.
    expect(document.querySelector("span.whitespace-pre-wrap")).toHaveTextContent(
      "**Rome** in April",
    );

    // Leaves nothing suspended behind the test.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("replaces it with the markdown renderer once the chunk is in", async () => {
    renderWithI18n(<MessageBubble message={message} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector("span.whitespace-pre-wrap")).not.toBeInTheDocument();
    expect(screen.getByText("**Rome** in April")).toBeInTheDocument();
  });
});

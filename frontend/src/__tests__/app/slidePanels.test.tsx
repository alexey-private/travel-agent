/**
 * Tests for the slide-in panels on the chat page.
 * Covers: which way each panel leaves the viewport under ltr and rtl, and that
 * the backdrop that dismisses one says so under a mouse — it is the only
 * clickable thing here that no base rule in globals.css can reach, a `<div>`
 * being indistinguishable from a decorative one in CSS.
 */

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import * as api from "@/lib/api";
import { renderWithI18n } from "../helpers/renderWithI18n";

jest.mock("@/lib/api");
jest.mock("@/components/chat/ChatWindow", () => ({
  __esModule: true,
  default: () => <div data-testid="chat" />,
}));
jest.mock("@/components/conversations/ConversationList", () => ({
  __esModule: true,
  default: () => <div data-testid="conversations" />,
}));
jest.mock("@/components/memory/MemoryPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="memory" />,
}));

describe("slide-in panels", () => {
  beforeEach(() => {
    (api.getOrCreateUserId as jest.Mock).mockReturnValue("session-test");
  });

  const conversationPanel = () => screen.getByTestId("conversations").parentElement!;
  const memoryPanel = () => screen.getByTestId("memory").parentElement!;

  it("hides the conversation panel to the left in a left-to-right layout", () => {
    renderWithI18n(<Home />, "en");
    expect(conversationPanel().className).toContain("-translate-x-full");
  });

  it("hides the conversation panel to the right in a right-to-left layout", () => {
    renderWithI18n(<Home />, "he");
    const className = conversationPanel().className;
    expect(className).toContain("translate-x-full");
    expect(className).not.toContain("-translate-x-full");
  });

  it("mirrors the memory panel the other way round", () => {
    renderWithI18n(<Home />, "he");
    expect(memoryPanel().className).toContain("-translate-x-full");
  });

  it.each([
    ["conversations", "Toggle conversations"],
    ["preferences", "Toggle preferences"],
  ])("points the cursor at the %s backdrop, which dismisses the panel", async (_name, toggleLabel) => {
    const { container } = renderWithI18n(<Home />, "en");
    await userEvent.click(screen.getByRole("button", { name: toggleLabel }));

    const backdrop = container.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    expect(backdrop!.className).toContain("cursor-pointer");
  });
});

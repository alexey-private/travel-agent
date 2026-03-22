/**
 * Tests for MemoryPanel component.
 * Covers: loading, rendering memories, empty state, delete, refresh.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MemoryPanel from "@/components/MemoryPanel";
import * as api from "@/lib/api";

jest.mock("@/lib/api");
const mockFetchMemories = api.fetchMemories as jest.MockedFunction<typeof api.fetchMemories>;
const mockDeleteMemory = api.deleteMemory as jest.MockedFunction<typeof api.deleteMemory>;

describe("MemoryPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the panel heading", async () => {
    mockFetchMemories.mockResolvedValue([]);
    render(<MemoryPanel userId="u1" />);
    expect(screen.getByText(/preferences/i)).toBeInTheDocument();
    await waitFor(() => expect(mockFetchMemories).toHaveBeenCalledTimes(1));
  });

  it("shows empty-state message when there are no memories", async () => {
    mockFetchMemories.mockResolvedValue([]);
    render(<MemoryPanel userId="u1" />);
    await waitFor(() =>
      expect(screen.getByText(/no preferences saved/i)).toBeInTheDocument(),
    );
  });

  it("renders memory entries", async () => {
    mockFetchMemories.mockResolvedValue([
      { key: "home_city", value: "San Francisco" },
      { key: "budget", value: "mid" },
    ]);
    render(<MemoryPanel userId="u1" />);
    await waitFor(() => expect(screen.getByText("San Francisco")).toBeInTheDocument());
    expect(screen.getByText("mid")).toBeInTheDocument();
    // Keys are displayed with underscores replaced
    expect(screen.getByText(/home city/i)).toBeInTheDocument();
  });

  it("removes a memory entry after clicking delete", async () => {
    mockFetchMemories.mockResolvedValue([{ key: "diet", value: "vegetarian" }]);
    mockDeleteMemory.mockResolvedValue(undefined);

    render(<MemoryPanel userId="u1" />);
    await waitFor(() => screen.getByText("vegetarian"));

    // Hover to reveal delete button then click
    const deleteBtn = document.querySelector("button[title='Delete \"diet\"']") as HTMLButtonElement;
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);

    await waitFor(() =>
      expect(screen.queryByText("vegetarian")).not.toBeInTheDocument(),
    );
    expect(mockDeleteMemory).toHaveBeenCalledWith("u1", "diet");
  });

  it("shows error message when fetchMemories fails", async () => {
    mockFetchMemories.mockRejectedValue(new Error("Network error"));
    render(<MemoryPanel userId="u1" />);
    await waitFor(() =>
      expect(screen.getByText(/network error/i)).toBeInTheDocument(),
    );
  });

  it("re-fetches memories when refreshTrigger changes", async () => {
    mockFetchMemories.mockResolvedValue([]);
    const { rerender } = render(<MemoryPanel userId="u1" refreshTrigger={0} />);
    await waitFor(() => expect(mockFetchMemories).toHaveBeenCalledTimes(1));

    rerender(<MemoryPanel userId="u1" refreshTrigger={1} />);
    await waitFor(() => expect(mockFetchMemories).toHaveBeenCalledTimes(2));
  });

  it("re-fetches when the refresh button is clicked", async () => {
    mockFetchMemories.mockResolvedValue([]);
    render(<MemoryPanel userId="u1" />);
    await waitFor(() => expect(mockFetchMemories).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle(/refresh memories/i));
    await waitFor(() => expect(mockFetchMemories).toHaveBeenCalledTimes(2));
  });
});

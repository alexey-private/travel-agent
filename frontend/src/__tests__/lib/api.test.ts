/**
 * Tests for src/lib/api.ts
 * Covers: getOrCreateUserId, streamChat (SSE parsing), fetchMemories, deleteMemory
 */

import { getOrCreateUserId, fetchMemories, deleteMemory, streamChat } from "@/lib/api";
import type { AgentEvent } from "@/lib/api";

// ─── localStorage helpers ──────────────────────────────────────────────────

describe("getOrCreateUserId", () => {
  beforeEach(() => localStorage.clear());

  it("generates a UUID on first call and stores it", () => {
    const id = getOrCreateUserId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(localStorage.getItem("travel_agent_user_id")).toBe(id);
  });

  it("returns the same UUID on subsequent calls", () => {
    const id1 = getOrCreateUserId();
    const id2 = getOrCreateUserId();
    expect(id1).toBe(id2);
  });

  it("reuses a UUID already present in localStorage", () => {
    localStorage.setItem("travel_agent_user_id", "custom-id");
    expect(getOrCreateUserId()).toBe("custom-id");
  });
});

// ─── fetchMemories ─────────────────────────────────────────────────────────

describe("fetchMemories", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns memories from the API", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ memories: [{ key: "home", value: "SF" }] }),
    } as Response);

    const result = await fetchMemories("user-1");
    expect(result).toEqual([{ key: "home", value: "SF" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/memory/user-1"),
    );
  });

  it("throws when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(fetchMemories("user-1")).rejects.toThrow("500");
  });
});

// ─── deleteMemory ──────────────────────────────────────────────────────────

describe("deleteMemory", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends DELETE to the correct URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    await deleteMemory("user-1", "home city");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/memory/user-1/home%20city"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

// ─── streamChat — SSE parsing ──────────────────────────────────────────────

function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

describe("streamChat", () => {
  afterEach(() => jest.restoreAllMocks());

  it("calls onEvent for each parsed SSE line", async () => {
    const sseChunk = [
      'data: {"type":"text","content":"Hello"}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeReadableStream(sseChunk),
    } as unknown as Response);

    const events: AgentEvent[] = [];
    await streamChat("u1", "hi", null, (e) => events.push(e));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "text", content: "Hello" });
    expect(events[1]).toEqual({ type: "done" });
  });

  it("handles chunks that split across lines", async () => {
    // Single SSE line split into two network chunks
    const sseChunks = [
      'data: {"type":"text","con',
      'tent":"split"}\n\ndata: {"type":"done"}\n\n',
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeReadableStream(sseChunks),
    } as unknown as Response);

    const events: AgentEvent[] = [];
    await streamChat("u1", "hi", null, (e) => events.push(e));

    expect(events[0]).toEqual({ type: "text", content: "split" });
    expect(events[1]).toEqual({ type: "done" });
  });

  it("throws when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      body: null,
    } as unknown as Response);

    await expect(streamChat("u1", "hi", null, jest.fn())).rejects.toThrow("503");
  });

  it("ignores malformed SSE lines without throwing", async () => {
    const sseChunks = [
      'data: not-json\n\ndata: {"type":"done"}\n\n',
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeReadableStream(sseChunks),
    } as unknown as Response);

    const events: AgentEvent[] = [];
    await expect(
      streamChat("u1", "hi", null, (e) => events.push(e)),
    ).resolves.not.toThrow();
    expect(events).toEqual([{ type: "done" }]);
  });
});

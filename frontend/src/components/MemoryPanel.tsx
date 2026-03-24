"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, RefreshCw, Brain } from "lucide-react";
import { fetchMemories, deleteMemory, type UserMemory } from "@/lib/api";

interface MemoryPanelProps {
  userId: string;
  /** Incremented by parent whenever new memories may have been saved */
  refreshTrigger?: number;
}

/**
 * Side panel that displays and manages the user's long-term memories.
 */
export default function MemoryPanel({ userId, refreshTrigger }: MemoryPanelProps) {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMemories(userId);
      setMemories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load on mount and whenever refreshTrigger changes
  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const handleDelete = async (key: string) => {
    try {
      await deleteMemory(userId, key);
      setMemories((prev) => prev.filter((m) => m.key !== key));
    } catch {
      setError("Failed to delete memory");
    }
  };

  return (
    <aside className="w-64 border-l border-gray-200 flex flex-col bg-gray-50 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Brain size={15} />
          Your Preferences
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
          title="Refresh memories"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {error && (
          <p className="text-xs text-red-500 text-center">{error}</p>
        )}

        {!loading && memories.length === 0 && !error && (
          <p className="text-xs text-gray-400 text-center mt-4">
            No preferences saved yet.
            <br />
            Chat with the agent and it will remember your preferences.
          </p>
        )}

        {memories.map((mem) => (
          <div
            key={mem.key}
            className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 capitalize">
                {mem.key.replace(/_/g, " ")}
              </p>
              <p className="text-sm text-gray-800 truncate" title={mem.value}>
                {mem.value}
              </p>
            </div>
            <button
              onClick={() => handleDelete(mem.key)}
              className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
              title={`Delete "${mem.key}"`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2, CheckSquare, X, Loader2 } from "lucide-react";
import { getOrCreateUserId } from "@/lib/api";
import {
  fetchEvents,
  fetchTasks,
  deleteEvent,
  updateEvent,
  deleteTask,
  updateTask,
  completeTask,
  CalendarEvent,
  Task,
} from "@/lib/calendarApi";

type Tab = "events" | "tasks";

interface EventEditState {
  title: string;
  date: string;
  endDate: string;
  time: string;
  description: string;
  category: string;
}

interface TaskEditState {
  title: string;
  notes: string;
  due: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  travel: "✈️",
  shopping: "🛍️",
  reminder: "🔔",
  other: "📅",
};

export default function CalendarPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("events");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventEditState>({ title: "", date: "", endDate: "", time: "", description: "", category: "other" });

  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskEditState>({ title: "", notes: "", due: "" });

  const [saving, setSaving] = useState(false);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const [evts, tsks] = await Promise.all([fetchEvents(uid), fetchTasks(uid)]);
      setEvents(evts);
      setTasks(tsks);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);
    load(uid);
  }, [load]);

  // ── Event actions ──────────────────────────────────────────────────────────

  const startEditEvent = (evt: CalendarEvent) => {
    setEditingEvent(evt.id);
    setEventForm({
      title: evt.title,
      date: evt.date,
      endDate: evt.endDate ?? "",
      time: evt.time && evt.time !== "All day" ? evt.time : "",
      description: evt.description ?? "",
      category: evt.category ?? "other",
    });
  };

  const saveEvent = async () => {
    if (!userId || !editingEvent) return;
    setSaving(true);
    try {
      await updateEvent(userId, editingEvent, {
        title: eventForm.title || undefined,
        date: eventForm.date || undefined,
        endDate: eventForm.endDate || undefined,
        time: eventForm.time || undefined,
        description: eventForm.description,
        category: eventForm.category || undefined,
      });
      setEditingEvent(null);
      await load(userId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!userId || !confirm("Delete this event?")) return;
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      await deleteEvent(userId, eventId);
    } catch (e) {
      setError((e as Error).message);
      await load(userId);
    }
  };

  // ── Task actions ───────────────────────────────────────────────────────────

  const startEditTask = (task: Task) => {
    setEditingTask(task.id);
    setTaskForm({
      title: task.title,
      notes: task.notes ?? "",
      due: task.due ?? "",
    });
  };

  const saveTask = async () => {
    if (!userId || !editingTask) return;
    setSaving(true);
    try {
      await updateTask(userId, editingTask, {
        title: taskForm.title || undefined,
        notes: taskForm.notes,
        due: taskForm.due || undefined,
      });
      setEditingTask(null);
      await load(userId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!userId) return;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "completed" } : t));
    try {
      await completeTask(userId, taskId);
      await load(userId);
    } catch (e) {
      setError((e as Error).message);
      await load(userId);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!userId || !confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await deleteTask(userId, taskId);
    } catch (e) {
      setError((e as Error).message);
      await load(userId);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-semibold text-gray-800">Calendar &amp; Tasks</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {(["events", "tasks"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "events" ? "Events" : "Tasks"}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center gap-2">
            <X size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : tab === "events" ? (
          /* ── Events list ── */
          <div className="space-y-2">
            {events.length === 0 && (
              <p className="text-center text-gray-400 py-8">No upcoming events.</p>
            )}
            {events.map((evt) =>
              editingEvent === evt.id ? (
                /* Edit form */
                <div key={evt.id} className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Title"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={eventForm.date}
                      onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    />
                    <input
                      type="time"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={eventForm.time}
                      onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                    />
                  </div>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="End date (optional)"
                    value={eventForm.endDate}
                    min={eventForm.date}
                    onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                  />
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={eventForm.category}
                    onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                  >
                    {["travel", "shopping", "reminder", "other"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={2}
                    placeholder="Description (optional)"
                    value={eventForm.description}
                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingEvent(null)}
                      className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEvent}
                      disabled={saving}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {saving && <Loader2 size={12} className="animate-spin" />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* Event row */
                <div key={evt.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-lg">{CATEGORY_EMOJI[evt.category] ?? "📅"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{evt.title}</p>
                    <p className="text-xs text-gray-400">
                      {evt.date}{evt.endDate ? ` – ${evt.endDate}` : ""}{evt.time && evt.time !== "All day" ? ` · ${evt.time}` : ""}
                      {evt.calendar ? ` · ${evt.calendar}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => startEditEvent(evt)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDeleteEvent(evt.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            )}
          </div>
        ) : (
          /* ── Tasks list ── */
          <div className="space-y-2">
            {tasks.length === 0 && (
              <p className="text-center text-gray-400 py-8">No pending tasks.</p>
            )}
            {tasks.map((task) =>
              editingTask === task.id ? (
                /* Edit form */
                <div key={task.id} className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Title"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  />
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={taskForm.due}
                    onChange={(e) => setTaskForm({ ...taskForm, due: e.target.value })}
                  />
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={2}
                    placeholder="Notes (optional)"
                    value={taskForm.notes}
                    onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingTask(null)}
                      className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveTask}
                      disabled={saving}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {saving && <Loader2 size={12} className="animate-spin" />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* Task row */
                <div
                  key={task.id}
                  className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 ${
                    task.status === "completed" || task.status === "COMPLETED"
                      ? "border-gray-100 opacity-50"
                      : "border-gray-100"
                  }`}
                >
                  <button
                    onClick={() => handleCompleteTask(task.id)}
                    className="text-gray-300 hover:text-green-500 transition-colors flex-shrink-0"
                    title="Mark complete"
                    disabled={task.status === "completed" || task.status === "COMPLETED"}
                  >
                    <CheckSquare size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${task.status === "completed" || task.status === "COMPLETED" ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {task.title}
                    </p>
                    {task.due && (
                      <p className="text-xs text-gray-400">due {task.due}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startEditTask(task)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

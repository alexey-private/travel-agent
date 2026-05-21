const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  time?: string;
  description?: string;
  category: string;
  calendar?: string;
  htmlLink?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: string;
}

export async function fetchEvents(userId: string): Promise<CalendarEvent[]> {
  const res = await fetch(`${API_URL}/api/calendar/events?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.upcoming ?? data.events ?? []) as CalendarEvent[];
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/calendar/events/${encodeURIComponent(eventId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function updateEvent(
  userId: string,
  eventId: string,
  fields: Partial<Omit<CalendarEvent, 'id'>>,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/calendar/events/${encodeURIComponent(eventId)}?userId=${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchTasks(userId: string, tasklistName?: string): Promise<Task[]> {
  const params = new URLSearchParams({ userId });
  if (tasklistName) params.set('tasklistName', tasklistName);
  const res = await fetch(`${API_URL}/api/calendar/tasks?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.tasks ?? []) as Task[];
}

export async function completeTask(userId: string, taskId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/calendar/tasks/${encodeURIComponent(taskId)}/complete?userId=${encodeURIComponent(userId)}`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function updateTask(
  userId: string,
  taskId: string,
  fields: Partial<Omit<Task, 'id' | 'status'>>,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/calendar/tasks/${encodeURIComponent(taskId)}?userId=${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/calendar/tasks/${encodeURIComponent(taskId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(await res.text());
}

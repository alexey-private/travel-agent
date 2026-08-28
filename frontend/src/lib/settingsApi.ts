import { API_URL } from "./config";
import { ApiError } from "./apiError";
import type { Locale } from "@/i18n/config";

export interface UserPreferences {
  calendarProvider: "google" | "apple";
  calendarName: string;
  shoppingCalendarName: string;
  taskListName: string;
  shoppingTaskListName: string;
  language: Locale;
}

export interface SettingsData extends UserPreferences {
  googleConnected: boolean;
  googleDriveConnected: boolean;
  appleConnected: boolean;
  appleId: string | null;
  reminderHref: string | null;
  shoppingReminderHref: string | null;
}

export async function getSettings(userId: string): Promise<SettingsData> {
  const res = await fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new ApiError("errors.loadSettingsFailed", res.status);
  return res.json() as Promise<SettingsData>;
}

export async function saveSettings(userId: string, prefs: Partial<UserPreferences>): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings?userId=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new ApiError("errors.saveSettingsFailed", res.status);
}

export async function connectApple(userId: string, appleId: string, appPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/apple/connect?userId=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appleId, appPassword }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error) throw new Error(data.error);
    throw new ApiError("errors.connectAppleFailed", res.status);
  }
}

export async function disconnectApple(userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/apple/disconnect?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError("errors.disconnectAppleFailed", res.status);
}

export async function getAppleStatus(userId: string): Promise<{ connected: boolean; appleId: string | null }> {
  try {
    const res = await fetch(`${API_URL}/auth/apple/status?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return { connected: false, appleId: null };
    return res.json() as Promise<{ connected: boolean; appleId: string | null }>;
  } catch {
    return { connected: false, appleId: null };
  }
}

export interface ReminderList { name: string; url: string; }

export async function getAppleReminderLists(userId: string): Promise<ReminderList[]> {
  const res = await fetch(`${API_URL}/auth/apple/reminder-lists?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const data = await res.json() as { lists: ReminderList[] };
  return data.lists ?? [];
}

export async function saveAppleReminderList(userId: string, url: string, isShoppingList: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/auth/apple/reminder-list?userId=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, isShoppingList }),
  });
  if (!res.ok) throw new ApiError("errors.saveReminderListFailed", res.status);
}

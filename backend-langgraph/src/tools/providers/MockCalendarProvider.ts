import { ToolResult } from '../../types/tools';
import { CalendarProvider, CalendarAddParams, CalendarListParams, CalendarDeleteParams } from './CalendarProvider';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  category: string;
  createdAt: string;
}

const store = new Map<string, CalendarEvent[]>();
let idCounter = 100;

export class MockCalendarProvider implements CalendarProvider {
  private events(userId: string): CalendarEvent[] {
    if (!store.has(userId)) store.set(userId, []);
    return store.get(userId)!;
  }

  async add(params: CalendarAddParams): Promise<ToolResult> {
    const { userId, title, date, time, description, category } = params;
    const event: CalendarEvent = {
      id: `evt_${(idCounter++).toString()}`,
      title, date,
      time: time ?? 'All day',
      description: description ?? '',
      category,
      createdAt: new Date().toISOString(),
    };
    const events = this.events(userId);
    events.push(event);
    events.sort((a, b) => a.date.localeCompare(b.date));
    return {
      success: true,
      data: {
        message: `Event "${title}" saved for ${date}${time ? ` at ${time}` : ''}.`,
        event,
        totalEvents: events.length,
        source: 'mock',
      },
    };
  }

  async list(params: CalendarListParams): Promise<ToolResult> {
    const events = this.events(params.userId);
    if (events.length === 0) {
      return { success: true, data: { message: 'No upcoming events.', events: [], total: 0, source: 'mock' } };
    }
    const today = new Date().toISOString().split('T')[0];
    return {
      success: true,
      data: {
        upcoming: events.filter(e => e.date >= today),
        past: events.filter(e => e.date < today),
        source: 'mock',
      },
    };
  }

  async delete(params: CalendarDeleteParams): Promise<ToolResult> {
    const { userId, eventId } = params;
    const events = this.events(userId);
    const remaining = events.filter(e => e.id !== eventId);
    store.set(userId, remaining);
    const deleted = events.length - remaining.length;
    return {
      success: true,
      data: {
        message: deleted > 0 ? `Event ${eventId} deleted.` : `Event ${eventId} not found.`,
        deleted,
        remaining: remaining.length,
        source: 'mock',
      },
    };
  }
}

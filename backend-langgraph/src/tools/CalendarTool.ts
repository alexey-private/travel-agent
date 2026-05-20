import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';

type CalendarAction = 'add' | 'list' | 'delete';

interface CalendarInput {
  action: CalendarAction;
  userId: string;
  title?: string;
  date?: string;
  time?: string;
  description?: string;
  category?: 'travel' | 'shopping' | 'reminder' | 'other';
  eventId?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  category: string;
  createdAt: string;
}

// In-memory store keyed by userId
const calendarStore = new Map<string, CalendarEvent[]>();

let idCounter = 100;
function nextId(): string {
  return `evt_${(idCounter++).toString()}`;
}

export class CalendarTool extends BaseTool {
  readonly name = 'manage_calendar';
  readonly description =
    'Manage calendar events and reminders — add, list, or delete events. Useful for saving travel dates, flight reminders, hotel check-in/check-out, shopping delivery dates, or any personal reminder. ' +
    'Use when the user wants to save a date, set a reminder, see upcoming events, or organize their schedule.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'list', 'delete'],
        description: '"add" a new event/reminder, "list" upcoming events, or "delete" an event by id',
      },
      userId: {
        type: 'string',
        description: 'User identifier to scope the calendar',
      },
      title: {
        type: 'string',
        description: 'Event title (required for add), e.g. "Flight to Tokyo", "Hotel check-in", "Order delivery"',
      },
      date: {
        type: 'string',
        description: 'Event date in YYYY-MM-DD format (required for add)',
      },
      time: {
        type: 'string',
        description: 'Event time in HH:MM format, 24h (optional, e.g. "14:30")',
      },
      description: {
        type: 'string',
        description: 'Additional details about the event (optional)',
      },
      category: {
        type: 'string',
        enum: ['travel', 'shopping', 'reminder', 'other'],
        description: 'Category for the event (default: other)',
      },
      eventId: {
        type: 'string',
        description: 'Event ID to delete (required for delete)',
      },
    },
    required: ['action', 'userId'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { action, userId, title, date, time, description, category = 'other', eventId } = input as CalendarInput;

    if (!calendarStore.has(userId)) {
      calendarStore.set(userId, []);
    }
    const events = calendarStore.get(userId)!;

    switch (action) {
      case 'add': {
        if (!title || !date) {
          return { success: false, error: 'title and date are required for add action' };
        }
        const event: CalendarEvent = {
          id: nextId(),
          title,
          date,
          time: time ?? 'All day',
          description: description ?? '',
          category,
          createdAt: new Date().toISOString(),
        };
        events.push(event);
        events.sort((a, b) => a.date.localeCompare(b.date));
        return {
          success: true,
          data: {
            message: `Event "${title}" saved for ${date}${time ? ` at ${time}` : ''}.`,
            event,
            totalEvents: events.length,
          },
        };
      }

      case 'list': {
        if (events.length === 0) {
          return { success: true, data: { message: 'No upcoming events.', events: [], total: 0 } };
        }
        const today = new Date().toISOString().split('T')[0];
        const upcoming = events.filter(e => e.date >= today);
        const past = events.filter(e => e.date < today);
        return {
          success: true,
          data: {
            upcoming,
            past,
            totalUpcoming: upcoming.length,
            totalPast: past.length,
          },
        };
      }

      case 'delete': {
        if (!eventId) {
          return { success: false, error: 'eventId is required for delete action' };
        }
        const before = events.length;
        const remaining = events.filter(e => e.id !== eventId);
        calendarStore.set(userId, remaining);
        const deleted = before - remaining.length;
        return {
          success: true,
          data: {
            message: deleted > 0 ? `Event ${eventId} deleted.` : `Event ${eventId} not found.`,
            deleted,
            remaining: remaining.length,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}

import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { CalendarProvider } from './providers/CalendarProvider';
import { MockCalendarProvider } from './providers/MockCalendarProvider';

type CalendarAction = 'add' | 'list' | 'delete';

interface CalendarInput {
  action: CalendarAction;
  userId: string;
  title?: string;
  date?: string;
  time?: string;
  description?: string;
  category?: string;
  eventId?: string;
}

const VALID_CATEGORIES = ['travel', 'shopping', 'reminder', 'other'] as const;


export class CalendarTool extends BaseTool {
  readonly name = 'manage_calendar';
  readonly description =
    'Manage calendar events — add, list, or delete events tied to a SPECIFIC DATE. ' +
    'Use ONLY for fixed-date occurrences: flight departure/arrival, hotel check-in/check-out, tour booking, delivery date, sale start date, trip dates. ' +
    'Do NOT use for actionable to-do items (things to book, buy, research, or call) — use manage_tasks for those. ' +
    'A calendar event requires a concrete date (date parameter is mandatory for add).';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
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
        description: 'Category for the event: travel, shopping, reminder, other (default: other)',
      },
      eventId: {
        type: 'string',
        description: 'Event ID to delete (required for delete)',
      },
    },
    required: ['action', 'userId'],
  };

  constructor(private provider: CalendarProvider = new MockCalendarProvider()) {
    super();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const raw = input as CalendarInput;
    const { userId, title, date, time, description, eventId } = raw;
    const action = raw.action?.toLowerCase() as CalendarAction | undefined;
    const category = VALID_CATEGORIES.includes(raw.category as typeof VALID_CATEGORIES[number])
      ? (raw.category as string)
      : 'other';

    switch (action) {
      case 'add': {
        if (!title || !date) {
          return { success: false, error: 'title and date are required for add action' };
        }
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRe.test(date) || isNaN(Date.parse(date))) {
          return { success: false, error: `Invalid date "${date}". Use YYYY-MM-DD format.` };
        }
        return this.provider.add({ userId, title, date, time, description, category });
      }

      case 'list':
        return this.provider.list({ userId });

      case 'delete': {
        if (!eventId) {
          return { success: false, error: 'eventId is required for delete action' };
        }
        return this.provider.delete({ userId, eventId });
      }

      default:
        return { success: false, error: `Unknown action: "${raw.action}". Use add, list, or delete.` };
    }
  }
}

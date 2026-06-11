import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { TasksProvider } from './providers/TasksProvider';
import { MockTasksProvider } from './providers/MockTasksProvider';

type TaskAction = 'add' | 'list' | 'complete' | 'delete' | 'update';

interface TasksInput {
  action: TaskAction;
  userId: string;
  title?: string;
  notes?: string;
  due?: string;
  tasklistName?: string;
  taskId?: string;
  includeCompleted?: boolean;
}

export class TasksTool extends BaseTool {
  readonly name = 'manage_tasks';
  readonly description =
    'Manage to-do tasks — add, list, complete, delete, or update actionable items. ' +
    'ALWAYS use this tool when the user says "add task", "task to", "to-do", "I need to book/buy/order/research/call/check X", or any similar actionable phrase. ' +
    'Tasks do NOT require a specific date — they have an optional due date and a completion status (needsAction / completed). ' +
    'Tasks appear in Google Calendar under the "My Tasks" sidebar. ' +
    'Unlike manage_calendar (which is for fixed-date events), manage_tasks is for actions the user needs to take.';

  readonly inputSchema: JSONSchema;

  constructor(private provider: TasksProvider = new MockTasksProvider(), defaultTasklist: string = 'Shopping') {
    super();
    this.inputSchema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '"add" a task, "list" tasks, "complete" a task by id, "delete" a task by id, or "update" a task by id',
        },
        userId: {
          type: 'string',
          description: 'User identifier to scope the task list',
        },
        title: {
          type: 'string',
          description: 'Task title (required for add), e.g. "Buy Sony WH-1000XM5 headphones"',
        },
        notes: {
          type: 'string',
          description: 'Additional details or notes for the task (optional)',
        },
        due: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format. REQUIRED for action=add — you MUST ask the user for a due date before calling this tool if they did not provide one.',
        },
        tasklistName: {
          type: 'string',
          description: `Name of the task list to use (default: "${defaultTasklist}")`,
        },
        taskId: {
          type: 'string',
          description: 'Task ID (required for complete, delete, and update)',
        },
        includeCompleted: {
          type: 'boolean',
          description: 'Whether to include completed tasks in list results (default: false)',
        },
      },
      required: ['action', 'userId'],
    };
  }

  private normalizeDue(raw: string): string | null {
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // DD/MM or DD/MM/YYYY or DD/MM/YY
    const dmMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (dmMatch) {
      const day = dmMatch[1].padStart(2, '0');
      const month = dmMatch[2].padStart(2, '0');
      let year = dmMatch[3];
      if (!year) {
        const now = new Date();
        const y = now.getFullYear();
        const candidate = new Date(`${y}-${month}-${day}`);
        year = String(candidate < now ? y + 1 : y);
      } else if (year.length === 2) {
        year = `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }
    // Try native parse as fallback
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const raw = input as TasksInput;
    const { userId, title, notes, taskId, tasklistName, includeCompleted } = raw;
    const action = raw.action?.toLowerCase() as TaskAction | undefined;

    const due = raw.due ? (this.normalizeDue(raw.due) ?? undefined) : undefined;
    if (raw.due && !due) {
      return { success: false, error: `Invalid due date "${raw.due}". Use YYYY-MM-DD format (e.g. 2026-06-20).` };
    }

    switch (action) {
      case 'add': {
        if (!title) return { success: false, error: 'title is required for add action' };
        if (!due) return { success: false, error: 'MISSING_DUE_DATE: Do NOT infer or guess a due date. Stop and ask the user directly: "By when would you like to complete this task? (e.g. May 25, or before your trip)"' };
        return this.provider.add({ userId, title, notes, due, tasklistName });
      }

      case 'list':
        return this.provider.list({ userId, tasklistName, includeCompleted });

      case 'complete': {
        if (!taskId) return { success: false, error: 'taskId is required for complete action' };
        return this.provider.complete({ userId, taskId, tasklistName });
      }

      case 'delete': {
        if (!taskId) return { success: false, error: 'taskId is required for delete action' };
        return this.provider.delete({ userId, taskId, tasklistName });
      }

      case 'update': {
        if (!taskId) return { success: false, error: 'taskId is required for update action' };
        return this.provider.update({ userId, taskId, title, notes, due, tasklistName });
      }

      default:
        return { success: false, error: `Unknown action: "${raw.action}". Use add, list, complete, delete, or update.` };
    }
  }
}

import { BaseTool } from './BaseTool';
import { ToolResult, JSONSchema } from '../types/tools';
import { TasksProvider } from './providers/TasksProvider';
import { MockTasksProvider } from './providers/MockTasksProvider';

type TaskAction = 'add' | 'list' | 'complete' | 'delete';

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
    'Manage Google Tasks — add, list, complete, or delete tasks. ' +
    'Use for actionable to-do items: things to buy, orders to place, products to research. ' +
    'Unlike calendar events, tasks have no fixed time — just an optional due date and a completion status. ' +
    'Tasks are visible in Google Calendar under "My Tasks" sidebar. ' +
    'Use when the user says "remind me to buy X", "add to my shopping list", "what\'s on my task list", or "mark X as done".';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '"add" a task, "list" tasks, "complete" a task by id, or "delete" a task by id',
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
        description: 'Due date in YYYY-MM-DD format (optional)',
      },
      tasklistName: {
        type: 'string',
        description: 'Name of the task list to use (default: "Shopping")',
      },
      taskId: {
        type: 'string',
        description: 'Task ID (required for complete and delete)',
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Whether to include completed tasks in list results (default: false)',
      },
    },
    required: ['action', 'userId'],
  };

  constructor(private provider: TasksProvider = new MockTasksProvider()) {
    super();
  }

  async execute(input: unknown): Promise<ToolResult> {
    const raw = input as TasksInput;
    const { userId, title, notes, taskId, tasklistName, includeCompleted } = raw;
    const action = raw.action?.toLowerCase() as TaskAction | undefined;

    const due = raw.due;
    if (due) {
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(due) || isNaN(Date.parse(due))) {
        return { success: false, error: `Invalid due date "${due}". Use YYYY-MM-DD format.` };
      }
    }

    switch (action) {
      case 'add': {
        if (!title) return { success: false, error: 'title is required for add action' };
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

      default:
        return { success: false, error: `Unknown action: "${raw.action}". Use add, list, complete, or delete.` };
    }
  }
}

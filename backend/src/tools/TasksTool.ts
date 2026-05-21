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
    'Manage to-do tasks — add, list, complete, or delete actionable items. ' +
    'ALWAYS use this tool when the user says "add task", "task to", "to-do", "I need to book/buy/order/research/call/check X", or any similar actionable phrase. ' +
    'Tasks do NOT require a specific date — they have an optional due date and a completion status (needsAction / completed). ' +
    'Tasks appear in Google Calendar under the "My Tasks" sidebar. ' +
    'Unlike manage_calendar (which is for fixed-date events), manage_tasks is for actions the user needs to take.';

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
        description: 'Due date in YYYY-MM-DD format. REQUIRED for action=add — you MUST ask the user for a due date before calling this tool if they did not provide one.',
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

      default:
        return { success: false, error: `Unknown action: "${raw.action}". Use add, list, complete, or delete.` };
    }
  }
}

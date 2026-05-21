import { ToolResult } from '../../types/tools';
import { TasksProvider, TasksAddParams, TasksListParams, TasksCompleteParams, TasksDeleteParams, TasksUpdateParams } from './TasksProvider';

interface MockTask {
  id: string;
  title: string;
  notes: string;
  due?: string;
  status: 'needsAction' | 'completed';
  createdAt: string;
}

const store = new Map<string, MockTask[]>();
let idCounter = 1;

export class MockTasksProvider implements TasksProvider {
  private tasks(userId: string): MockTask[] {
    if (!store.has(userId)) store.set(userId, []);
    return store.get(userId)!;
  }

  async add(params: TasksAddParams): Promise<ToolResult> {
    const { userId, title, notes, due } = params;
    const task: MockTask = {
      id: `task_${(idCounter++).toString()}`,
      title,
      notes: notes ?? '',
      due,
      status: 'needsAction',
      createdAt: new Date().toISOString(),
    };
    this.tasks(userId).push(task);
    return {
      success: true,
      data: {
        message: `Task "${title}" added${due ? ` (due ${due})` : ''}.`,
        task,
        source: 'mock',
      },
    };
  }

  async list(params: TasksListParams): Promise<ToolResult> {
    const all = this.tasks(params.userId);
    const tasks = params.includeCompleted ? all : all.filter(t => t.status !== 'completed');
    return {
      success: true,
      data: { tasks, total: tasks.length, source: 'mock' },
    };
  }

  async complete(params: TasksCompleteParams): Promise<ToolResult> {
    const tasks = this.tasks(params.userId);
    const task = tasks.find(t => t.id === params.taskId);
    if (!task) return { success: false, error: `Task ${params.taskId} not found.` };
    task.status = 'completed';
    return {
      success: true,
      data: { message: `Task "${task.title}" marked as completed.`, task, source: 'mock' },
    };
  }

  async delete(params: TasksDeleteParams): Promise<ToolResult> {
    const tasks = this.tasks(params.userId);
    const idx = tasks.findIndex(t => t.id === params.taskId);
    if (idx === -1) return { success: false, error: `Task ${params.taskId} not found.` };
    const [deleted] = tasks.splice(idx, 1);
    return {
      success: true,
      data: { message: `Task "${deleted.title}" deleted.`, source: 'mock' },
    };
  }

  async update(params: TasksUpdateParams): Promise<ToolResult> {
    const task = this.tasks(params.userId).find(t => t.id === params.taskId);
    if (!task) return { success: false, error: `Task ${params.taskId} not found.` };
    if (params.title) task.title = params.title;
    if (params.notes !== undefined) task.notes = params.notes;
    if (params.due !== undefined) task.due = params.due;
    return {
      success: true,
      data: { message: `Task "${task.title}" updated.`, task, source: 'mock' },
    };
  }
}

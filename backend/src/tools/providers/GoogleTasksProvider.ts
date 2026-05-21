import { google } from 'googleapis';
import { ToolResult } from '../../types/tools';
import { TasksProvider, TasksAddParams, TasksListParams, TasksCompleteParams, TasksDeleteParams } from './TasksProvider';
import { GoogleTokenRepository } from '../../repositories/GoogleTokenRepository';

const DEFAULT_TASKLIST = 'Shopping';

export class GoogleTasksProvider implements TasksProvider {
  constructor(
    private tokenRepo: GoogleTokenRepository,
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string,
  ) {}

  private async getClient(userId: string) {
    const tokens = await this.tokenRepo.get(userId);
    if (!tokens) throw new Error('Google not connected. Please connect your Google account first.');

    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });

    auth.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await this.tokenRepo.save(userId, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token ?? tokens.refreshToken,
          expiryDate: newTokens.expiry_date ?? tokens.expiryDate,
        });
      }
    });

    return google.tasks({ version: 'v1', auth });
  }

  private async getOrCreateTasklistId(tasks: ReturnType<typeof google.tasks>, name: string): Promise<string> {
    const lists = await tasks.tasklists.list({ maxResults: 100 });
    const existing = lists.data.items?.find(l => l.title === name);
    if (existing?.id) return existing.id;

    const created = await tasks.tasklists.insert({ requestBody: { title: name } });
    return created.data.id!;
  }

  // Find a task across all relevant tasklists (for complete/delete when tasklistName not specified)
  private async findTasklistForTask(tasks: ReturnType<typeof google.tasks>, taskId: string): Promise<string | null> {
    const lists = await tasks.tasklists.list({ maxResults: 100 });
    for (const list of lists.data.items ?? []) {
      if (!list.id) continue;
      try {
        await tasks.tasks.get({ tasklist: list.id, task: taskId });
        return list.id;
      } catch {
        // not in this list
      }
    }
    return null;
  }

  async add(params: TasksAddParams): Promise<ToolResult> {
    const { userId, title, notes, due, tasklistName = DEFAULT_TASKLIST } = params;
    try {
      const tasksClient = await this.getClient(userId);
      const tasklistId = await this.getOrCreateTasklistId(tasksClient, tasklistName);

      const task = await tasksClient.tasks.insert({
        tasklist: tasklistId,
        requestBody: {
          title,
          notes: notes ?? '',
          ...(due ? { due: `${due}T00:00:00.000Z` } : {}),
          status: 'needsAction',
        },
      });

      return {
        success: true,
        data: {
          message: `Task "${title}" added to "${tasklistName}" list${due ? ` (due ${due})` : ''}.`,
          task: {
            id: task.data.id,
            title,
            notes: notes ?? '',
            due,
            status: 'needsAction',
          },
          source: 'google',
        },
      };
    } catch (err) {
      return { success: false, error: tasksErrorMessage(err) };
    }
  }

  async list(params: TasksListParams): Promise<ToolResult> {
    const { userId, tasklistName = DEFAULT_TASKLIST, includeCompleted = false } = params;
    try {
      const tasksClient = await this.getClient(userId);
      const tasklistId = await this.getOrCreateTasklistId(tasksClient, tasklistName);

      const res = await tasksClient.tasks.list({
        tasklist: tasklistId,
        showCompleted: includeCompleted,
        showHidden: false,
        maxResults: 50,
      });

      const tasks = (res.data.items ?? []).map(t => ({
        id: t.id,
        title: t.title ?? '(no title)',
        notes: t.notes ?? '',
        due: t.due ? t.due.split('T')[0] : undefined,
        status: t.status,
      }));

      return {
        success: true,
        data: { tasks, total: tasks.length, tasklist: tasklistName, source: 'google' },
      };
    } catch (err) {
      return { success: false, error: tasksErrorMessage(err) };
    }
  }

  async complete(params: TasksCompleteParams): Promise<ToolResult> {
    const { userId, taskId, tasklistName = DEFAULT_TASKLIST } = params;
    try {
      const tasksClient = await this.getClient(userId);
      let tasklistId = await this.getOrCreateTasklistId(tasksClient, tasklistName);

      try {
        await tasksClient.tasks.get({ tasklist: tasklistId, task: taskId });
      } catch {
        const found = await this.findTasklistForTask(tasksClient, taskId);
        if (!found) return { success: false, error: `Task ${taskId} not found.` };
        tasklistId = found;
      }

      const updated = await tasksClient.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: { status: 'completed' },
      });

      return {
        success: true,
        data: {
          message: `Task "${updated.data.title}" marked as completed.`,
          task: { id: updated.data.id, title: updated.data.title, status: 'completed' },
          source: 'google',
        },
      };
    } catch (err) {
      return { success: false, error: tasksErrorMessage(err) };
    }
  }

  async delete(params: TasksDeleteParams): Promise<ToolResult> {
    const { userId, taskId, tasklistName = DEFAULT_TASKLIST } = params;
    try {
      const tasksClient = await this.getClient(userId);
      let tasklistId = await this.getOrCreateTasklistId(tasksClient, tasklistName);

      try {
        await tasksClient.tasks.get({ tasklist: tasklistId, task: taskId });
      } catch {
        const found = await this.findTasklistForTask(tasksClient, taskId);
        if (!found) return { success: false, error: `Task ${taskId} not found.` };
        tasklistId = found;
      }

      await tasksClient.tasks.delete({ tasklist: tasklistId, task: taskId });

      return {
        success: true,
        data: { message: `Task ${taskId} deleted.`, source: 'google' },
      };
    } catch (err) {
      return { success: false, error: tasksErrorMessage(err) };
    }
  }
}

function tasksErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Google returns 403 when the token was issued before the tasks scope was added.
  if (msg.includes('insufficient') || msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
    return 'Google Tasks permission missing. Please disconnect and reconnect your Google account in the right panel — the Tasks permission was added recently and requires re-authorization.';
  }
  return msg;
}

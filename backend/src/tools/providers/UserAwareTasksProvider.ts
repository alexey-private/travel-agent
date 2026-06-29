import { UserPreferencesRepository } from '../../repositories/UserPreferencesRepository';
import {
  TasksProvider,
  TasksAddParams,
  TasksListParams,
  TasksCompleteParams,
  TasksDeleteParams,
  TasksUpdateParams,
} from './TasksProvider';
import { ToolResult } from '../../types/tools';

export class UserAwareTasksProvider implements TasksProvider {
  constructor(
    private googleProvider: TasksProvider,
    private appleProvider: TasksProvider,
    private prefRepo: UserPreferencesRepository,
  ) {}

  private async resolve(userId: string): Promise<TasksProvider> {
    const prefs = await this.prefRepo.get(userId);
    return prefs.calendarProvider === 'apple' ? this.appleProvider : this.googleProvider;
  }

  private wrap(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    return fn().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
        return { success: false as const, error: 'Google account needs reconnection. Please go to Settings and reconnect Google Calendar.' };
      }
      return { success: false as const, error: msg };
    });
  }

  async add(params: TasksAddParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.add(params)));
  }

  async list(params: TasksListParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.list(params)));
  }

  async complete(params: TasksCompleteParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.complete(params)));
  }

  async delete(params: TasksDeleteParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.delete(params)));
  }

  async update(params: TasksUpdateParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.update(params)));
  }
}

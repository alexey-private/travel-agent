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

  async add(params: TasksAddParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).add(params);
  }

  async list(params: TasksListParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).list(params);
  }

  async complete(params: TasksCompleteParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).complete(params);
  }

  async delete(params: TasksDeleteParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).delete(params);
  }

  async update(params: TasksUpdateParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).update(params);
  }
}

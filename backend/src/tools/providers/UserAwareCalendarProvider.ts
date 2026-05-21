import { UserPreferencesRepository } from '../../repositories/UserPreferencesRepository';
import {
  CalendarProvider,
  CalendarAddParams,
  CalendarListParams,
  CalendarDeleteParams,
} from './CalendarProvider';
import { ToolResult } from '../../types/tools';

export class UserAwareCalendarProvider implements CalendarProvider {
  constructor(
    private googleProvider: CalendarProvider,
    private appleProvider: CalendarProvider,
    private prefRepo: UserPreferencesRepository,
  ) {}

  private async resolve(userId: string): Promise<CalendarProvider> {
    const prefs = await this.prefRepo.get(userId);
    return prefs.calendarProvider === 'apple' ? this.appleProvider : this.googleProvider;
  }

  async add(params: CalendarAddParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).add(params);
  }

  async list(params: CalendarListParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).list(params);
  }

  async delete(params: CalendarDeleteParams): Promise<ToolResult> {
    return (await this.resolve(params.userId)).delete(params);
  }
}

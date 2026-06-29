import { UserPreferencesRepository } from '../../repositories/UserPreferencesRepository';
import {
  CalendarProvider,
  CalendarAddParams,
  CalendarListParams,
  CalendarDeleteParams,
  CalendarUpdateParams,
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

  private wrap(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    return fn().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
        return { success: false as const, error: 'Google account needs reconnection. Please go to Settings and reconnect Google Calendar.' };
      }
      return { success: false as const, error: msg };
    });
  }

  async add(params: CalendarAddParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.add(params)));
  }

  async list(params: CalendarListParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.list(params)));
  }

  async delete(params: CalendarDeleteParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.delete(params)));
  }

  async update(params: CalendarUpdateParams): Promise<ToolResult> {
    return this.wrap(() => this.resolve(params.userId).then(p => p.update(params)));
  }
}

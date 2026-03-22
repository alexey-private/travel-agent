import { UserMemory } from '../types/memory';

export class AgentContext {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly userMessage: string,
    public readonly memories: UserMemory[],
    public readonly ragContext: string | null,
    public readonly history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {}
}

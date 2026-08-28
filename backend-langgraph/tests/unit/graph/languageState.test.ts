import { AgentState } from '@/graph/state';
import { buildTravelAgentSystemPrompt } from '@/agent/prompts';
import type { AgentStateType } from '@/graph/state';

describe('AgentState.language', () => {
  it('is part of the state annotation', () => {
    expect(Object.keys(AgentState.spec)).toContain('language');
  });

  it('reaches the prompt builder', () => {
    const state = {
      memories: [],
      userId: 'u1',
      taskListName: 'Travel Plans',
      ragContext: null,
      platform: 'web' as const,
      language: 'he' as const,
    } as unknown as AgentStateType;

    const prompt = buildTravelAgentSystemPrompt(
      state.memories ?? [],
      state.userId,
      state.taskListName,
      state.ragContext,
      state.platform,
      state.language,
    );
    expect(prompt).toContain('Hebrew');
  });
});

import { createModelPair } from '@/llm/modelPair';

jest.mock('@/config/env', () => ({
  env: { LLM_PROVIDER: 'anthropic' },
}));

describe('createModelPair', () => {
  it('builds the primary eagerly and the standby not at all', () => {
    const build = jest.fn((provider: string) => `model-${provider}`);

    createModelPair(build as never);

    // The primary is what every request uses; building it lazily would only move
    // its cost into the first user's latency.
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith('anthropic');
  });

  it('answers the active provider with the model it already built', () => {
    const build = jest.fn((provider: string) => `model-${provider}`);

    const modelFor = createModelPair(build as never);

    expect(modelFor('anthropic')).toBe('model-anthropic');
    expect(modelFor('anthropic')).toBe('model-anthropic');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('builds the standby on first use and reuses it after that', () => {
    const build = jest.fn((provider: string) => `model-${provider}`);

    const modelFor = createModelPair(build as never);
    const first = modelFor('openai');
    const second = modelFor('openai');

    expect(first).toBe('model-openai');
    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenLastCalledWith('openai');
  });

  it('builds both from the same recipe, so their options cannot drift', () => {
    // The one reason this helper takes a builder rather than createModel's own
    // arguments: a second argument list is a second place to edit.
    const build = jest.fn((provider: string) => ({ provider, maxTokens: 150 }));

    const modelFor = createModelPair(build as never);

    expect(modelFor('anthropic')).toEqual({ provider: 'anthropic', maxTokens: 150 });
    expect(modelFor('openai')).toEqual({ provider: 'openai', maxTokens: 150 });
  });
});

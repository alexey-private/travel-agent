import { buildTravelAgentSystemPrompt, buildShoppingAgentSystemPrompt } from '@/agent/prompts';

const builders = [
  ['travel', buildTravelAgentSystemPrompt],
  ['shopping', buildShoppingAgentSystemPrompt],
] as const;

describe.each(builders)('%s system prompt — language block', (_name, build) => {
  it('names Hebrew when the user speaks Hebrew', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toContain('## Language');
    expect(prompt).toContain('Hebrew');
  });

  it('names Russian when the user speaks Russian', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'ru');
    expect(prompt).toContain('Russian');
    expect(prompt).not.toContain("The user's language is Hebrew");
  });

  it('defaults to English when no language is given', () => {
    const prompt = build([], 'u1');
    expect(prompt).toContain('## Language');
    expect(prompt).toContain('English');
  });

  it('tells the agent to follow the language of the latest message', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toMatch(/reply in THAT language/i);
  });

  it('tells the agent to translate tool output instead of surfacing it raw', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toMatch(/never surface raw English tool output/i);
  });

  it('tells the agent to leave identifiers alone', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'web', 'he');
    expect(prompt).toMatch(/airport\/IATA codes/i);
  });

  it('keeps the Telegram formatting block working alongside the language block', () => {
    const prompt = build([], 'u1', 'Travel Plans', null, 'telegram', 'he');
    expect(prompt).toContain('## Language');
    expect(prompt).toContain('Telegram');
    expect(prompt).toContain('NEVER use pipe tables');
  });
});

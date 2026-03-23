import { Pool } from 'pg';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { UserMemory } from '../types/memory';
import { LLMClient } from '../llm/LLMClient';

const EXTRACT_MEMORIES_PROMPT = `You are a memory extraction assistant.
Given a message from the user, extract key personal facts and persistent preferences as a JSON object.
Focus on: name, home city, preferred airlines, seat preference, dietary restrictions, budget level,
travel style, passport/visa country, preferred hotel type, and any other persistent preferences.

Rules:
- Only extract facts the user explicitly stated about themselves — never infer from context.
- Do not extract trip-specific details (destination, travel dates, number of nights, etc.).
- If a fact was already known (provided in "Existing memories"), only include it in the output
  if the user is explicitly updating or correcting it.
- Return ONLY a valid JSON object. If nothing new can be extracted, return {}.

Example output:
{"name": "Alex", "home_city": "San Francisco", "diet": "vegetarian", "budget": "mid-range", "airline": "United"}`;

/**
 * Service for managing user long-term memory.
 * Stores and retrieves key-value preference pairs extracted from conversations.
 */
export class MemoryService {
  private repo: MemoryRepository;
  private llmClient: LLMClient | null;

  constructor(pool: Pool, llmClient: LLMClient | null = null) {
    this.repo = new MemoryRepository(pool);
    this.llmClient = llmClient;
  }

  /**
   * Returns all stored memories for the given user.
   */
  async getMemories(userId: string): Promise<UserMemory[]> {
    return this.repo.getMemories(userId);
  }

  /**
   * Deletes a single memory key for the user.
   */
  async deleteMemory(userId: string, key: string): Promise<void> {
    return this.repo.deleteMemory(userId, key);
  }

  /**
   * Uses the LLM to extract user preferences from the user's message,
   * then persists each extracted key-value pair via upsert.
   *
   * Existing memories are passed as context so the extractor avoids
   * overwriting known facts with weaker/inferred signals.
   *
   * Silently skips extraction if the message is empty or the LLM returns
   * an unparseable response.
   *
   * @param userId - The internal user UUID
   * @param userMessage - The raw user message from the last exchange
   */
  async extractAndSaveMemories(userId: string, userMessage: string): Promise<void> {
    if (!userMessage.trim() || !this.llmClient) return;

    const existing = await this.repo.getMemories(userId);
    const existingSection =
      existing.length > 0
        ? `\nExisting memories:\n${existing.map(m => `- ${m.key}: ${m.value}`).join('\n')}\n`
        : '';

    let extracted: Record<string, string>;
    try {
      const text = await this.llmClient.complete({
        system: EXTRACT_MEMORIES_PROMPT,
        messages: [{ role: 'user', content: `${existingSection}User message:\n${userMessage}` }],
        maxTokens: 512,
      });

      // Extract the JSON object from the response (may have surrounding text)
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return;

      extracted = JSON.parse(match[0]) as Record<string, string>;
    } catch {
      // Non-fatal: if extraction fails we simply skip saving
      return;
    }

    // Persist each extracted preference
    await Promise.all(
      Object.entries(extracted).map(([key, value]) =>
        this.repo.upsertMemory(userId, key, String(value)),
      ),
    );
  }
}

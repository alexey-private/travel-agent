import { Pool } from 'pg';
import { HumanMessage } from '@langchain/core/messages';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { UserMemory } from '../types/memory';
import { createModel } from '../llm/createModel';

const TRAVEL_EXTRACT_PROMPT = `You are a memory extraction assistant.
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

const SHOPPING_EXTRACT_PROMPT = `You are a memory extraction assistant.
Given a message from the user, extract key personal facts and persistent shopping preferences as a JSON object.
Focus on: name, preferred brands, budget range, favorite stores, size preferences, product categories of interest,
payment method, current devices the user owns or uses (laptop, phone, tablet, TV, smartwatch, etc.),
and any other persistent shopping preferences.

Rules:
- Only extract facts the user explicitly stated about themselves — never infer from context.
- "I use X", "I have X", "I own X", "my X is Y" are explicit statements and MUST be extracted as current devices.
- Do not extract order-specific details (specific items being purchased now, one-time deals, etc.).
- If a fact was already known (provided in "Existing memories"), only include it in the output
  if the user is explicitly updating or correcting it.
- Return ONLY a valid JSON object. If nothing new can be extracted, return {}.

Example output:
{"name": "Alex", "preferred_brands": "Nike, Apple", "budget_range": "mid-range", "favorite_stores": "Amazon, Best Buy", "size_preferences": "M shirt, 10 shoes", "current_laptop": "Lenovo IdeaPad Slim 5", "current_phone": "iPhone 15"}`;

/**
 * Service for managing user long-term memory.
 * Stores and retrieves key-value preference pairs extracted from conversations.
 */
export class MemoryService {
  private repo: MemoryRepository;

  constructor(pool: Pool) {
    this.repo = new MemoryRepository(pool);
  }

  /**
   * Returns all stored memories for the given user.
   */
  async getMemories(userId: string, agentType: 'travel' | 'shopping' = 'travel'): Promise<UserMemory[]> {
    return this.repo.getMemories(userId, agentType);
  }

  /**
   * Deletes a single memory key for the user.
   */
  async deleteMemory(userId: string, key: string, agentType: 'travel' | 'shopping' = 'travel'): Promise<void> {
    return this.repo.deleteMemory(userId, key, agentType);
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
  async extractAndSaveMemories(
    userId: string,
    userMessage: string,
    agentType: 'travel' | 'shopping' = 'travel',
  ): Promise<void> {
    if (!userMessage.trim()) return;

    const existing = await this.repo.getMemories(userId, agentType);
    const existingSection =
      existing.length > 0
        ? `\nExisting memories:\n${existing.map(m => `- ${m.key}: ${m.value}`).join('\n')}\n`
        : '';

    const systemPrompt = agentType === 'shopping' ? SHOPPING_EXTRACT_PROMPT : TRAVEL_EXTRACT_PROMPT;

    try {
      const response = await createModel('fast', 512).invoke([
        new HumanMessage(`${systemPrompt}\n\n${existingSection}User message:\n${userMessage}`),
      ]);

      const text = typeof response.content === 'string' ? response.content : '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return;

      const extracted = JSON.parse(match[0]) as Record<string, string>;

      await Promise.all(
        Object.entries(extracted).map(([key, value]) =>
          this.repo.upsertMemory(userId, key, String(value), agentType),
        ),
      );
    } catch {
      // Non-fatal: skip saving on error
    }
  }
}

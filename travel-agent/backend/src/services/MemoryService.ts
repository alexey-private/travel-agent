import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { UserMemory } from '../types/memory';

const EXTRACT_MEMORIES_PROMPT = `You are a memory extraction assistant.
Given a travel planning conversation, extract key user preferences and facts as a JSON object.
Focus on: home city, preferred airlines, dietary restrictions, budget level, travel style,
visa/passport country, preferred hotel type, and any other persistent preferences mentioned.

Return ONLY a valid JSON object where keys are snake_case preference names and values are short strings.
If nothing meaningful can be extracted, return an empty object {}.

Example output:
{"home_city": "San Francisco", "diet": "vegetarian", "budget": "mid-range", "airline": "United"}`;

/**
 * Service for managing user long-term memory.
 * Stores and retrieves key-value preference pairs extracted from conversations.
 */
export class MemoryService {
  private repo: MemoryRepository;
  private anthropic: Anthropic;

  constructor(pool: Pool, anthropic: Anthropic) {
    this.repo = new MemoryRepository(pool);
    this.anthropic = anthropic;
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
   * Uses Claude to extract user preferences from the conversation text,
   * then persists each extracted key-value pair via upsert.
   *
   * Silently skips extraction if the conversation is empty or Claude returns
   * an unparseable response.
   *
   * @param userId - The internal user UUID
   * @param conversationText - Combined user+assistant turns from the last exchange
   */
  async extractAndSaveMemories(userId: string, conversationText: string): Promise<void> {
    if (!conversationText.trim()) return;

    let extracted: Record<string, string>;
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // Cheaper model; extraction is simple
        max_tokens: 512,
        system: EXTRACT_MEMORIES_PROMPT,
        messages: [{ role: 'user', content: conversationText }],
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('');

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

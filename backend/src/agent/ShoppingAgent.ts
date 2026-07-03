import { LLMClient } from '../llm/LLMClient';
import { ToolRegistry } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { buildShoppingAgentSystemPrompt } from './prompts';

export class ShoppingAgent extends BaseAgent {
  constructor(toolRegistry: ToolRegistry, llmClient: LLMClient) {
    super(toolRegistry, llmClient, buildShoppingAgentSystemPrompt, 'shopping');
  }
}

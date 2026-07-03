import { LLMClient } from '../llm/LLMClient';
import { ToolRegistry } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { buildTravelAgentSystemPrompt } from './prompts';

export class TravelAgent extends BaseAgent {
  constructor(toolRegistry: ToolRegistry, llmClient: LLMClient) {
    super(toolRegistry, llmClient, buildTravelAgentSystemPrompt, 'travel');
  }
}

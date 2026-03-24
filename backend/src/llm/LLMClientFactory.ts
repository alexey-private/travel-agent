import { LLMClient } from './LLMClient';
import { AnthropicLLMClient } from './AnthropicLLMClient';
import { OpenAILLMClient } from './OpenAILLMClient';

export type LLMProvider = 'anthropic' | 'openai';

export interface LLMClientConfig {
  provider: LLMProvider;
  apiKey: string;
}

/**
 * Factory that instantiates the correct {@link LLMClient} for a given provider.
 *
 * ### Adding a new provider
 * 1. Implement `LLMClient` in `src/llm/<Provider>LLMClient.ts`
 * 2. Add the provider name to the `LLMProvider` union above
 * 3. Add a `case` below that returns `new <Provider>LLMClient(config.apiKey)`
 * 4. Add the corresponding API key to `.env` and `src/config/env.ts`
 */
export class LLMClientFactory {
  static create(config: LLMClientConfig): LLMClient {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicLLMClient(config.apiKey);
      case 'openai':
        return new OpenAILLMClient(config.apiKey);
      default:
        // Exhaustive check — TypeScript will error here when a new provider
        // is added to the union but not handled in the switch.
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }
}

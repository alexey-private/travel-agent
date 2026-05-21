import { UserMemory } from '../types/memory';
import { UserContentBlock } from '../llm/types';

export interface AgentAttachment {
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

export class AgentContext {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly userMessage: string,
    public readonly memories: UserMemory[],
    public readonly ragContext: string | null,
    public readonly history: Array<{ role: 'user' | 'assistant'; content: string }>,
    public readonly sessionId?: string,
    public readonly taskListName?: string,
    public readonly attachments?: AgentAttachment[],
  ) {}

  /**
   * Returns multimodal content blocks (text + binary attachments) when files were attached,
   * or the plain text string when there are none.
   * Pass `text` to override userMessage (e.g. when RAG context has been prepended).
   */
  buildUserContent(text?: string): string | UserContentBlock[] {
    const body = text ?? this.userMessage;
    if (!this.attachments || this.attachments.length === 0) return body;
    const blocks: UserContentBlock[] = [{ type: 'text', text: body }];
    for (const att of this.attachments) {
      if (att.mimeType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } });
      } else if (att.mimeType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.base64 } });
      }
    }
    return blocks;
  }
}

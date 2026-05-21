import { PDFParse } from 'pdf-parse';
import { UserMemory } from '../types/memory';
import { UserContentBlock } from '../llm/types';
import { env } from '../config/env';

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
  async buildUserContent(text?: string): Promise<string | UserContentBlock[]> {
    const body = text || this.userMessage || 'Please analyze the attached file(s).';
    if (!this.attachments || this.attachments.length === 0) return body;
    const blocks: UserContentBlock[] = [{ type: 'text', text: body }];
    for (const att of this.attachments) {
      if (att.mimeType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } });
      } else if (att.mimeType === 'application/pdf' && env.LLM_PROVIDER === 'anthropic') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.base64 } });
      } else if (att.mimeType === 'application/pdf') {
        // OpenAI doesn't support the 'document' content type — extract text server-side instead.
        const buf = Buffer.from(att.base64, 'base64');
        const parsed = await new PDFParse({ data: buf }).getText();
        blocks.push({ type: 'text', text: `[PDF: ${att.name}]\n${parsed.text}` });
      }
    }
    return blocks;
  }
}

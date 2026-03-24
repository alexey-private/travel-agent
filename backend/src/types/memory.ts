export interface UserMemory {
  key: string;
  value: string;
}

export interface KnowledgeChunk {
  topic: string;
  content: string;
  similarity: number;
}

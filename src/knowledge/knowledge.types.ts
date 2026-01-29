export interface ExtractedKnowledge {
  id: string;
  content: string;
  category: string;
  tags: string[];
  source_conversation_id: string | null;
  source_message_range: { startIndex: number; endIndex: number } | null;
  extracted_by: string;
  embedding: number[] | null;
  created_at: string;
}

export interface LlmExtractedItem {
  content: string;
  category: string;
  tags: string[];
}

export interface SimilarKnowledge {
  id: string;
  content: string;
  category: string;
  similarity: number;
}

export const KNOWLEDGE_CATEGORIES = [
  '対応方法',
  '業界用語',
  '業務知識',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

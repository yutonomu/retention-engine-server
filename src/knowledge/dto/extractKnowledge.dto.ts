export type ExtractionRange =
  | 'all'
  | 'recent'
  | { startIndex: number; endIndex: number };

export interface ExtractKnowledgeDto {
  conversationId: string;
  range?: ExtractionRange;
}

export interface ExtractKnowledgeRequest {
  conversationId: string;
  range: ExtractionRange;
  userId: string;
}

export interface SaveKCCandidateDto {
  title: string;
  situation: string; // 状況
  knowhow: string; // ノウハウ
  precaution: string; // 注意点
  tags: string[];
  confidence: number;
  importance?: string; // 重要性
  example?: string; // 具体例
  sourceMessageRange?: { start: number; end: number };
}

export interface SaveKnowledgeCardDto {
  conversationId: string;
  candidate: SaveKCCandidateDto;
}

export interface SaveKnowledgeCardRequest {
  conversationId: string;
  candidate: SaveKCCandidateDto;
  userId: string;
}

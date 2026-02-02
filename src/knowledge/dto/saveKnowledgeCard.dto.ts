export interface SaveKCCandidateDto {
  title: string;
  situation: string;  // 状況
  knowhow: string;    // ノウハウ
  precaution: string; // 注意点
  tags: string[];
  confidence: number;
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

export type DetectionRange = 'all' | 'recent';

export interface DetectTacitKnowledgeDto {
  conversationId: string;
  startIndex?: number; // 前回検出以降のメッセージのみ
  range?: DetectionRange;
}

export interface DetectTacitKnowledgeRequest {
  conversationId: string;
  startIndex?: number;
  range: DetectionRange;
  userId: string;
}

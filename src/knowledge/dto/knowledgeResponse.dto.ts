export interface ExtractedKnowledgeItem {
  id: string;
  content: string;
  category: string;
  tags: string[];
}

export interface DuplicateKnowledgeItem {
  content: string;
  category: string;
  existingId: string;
  similarity: number;
}

/** 旧レスポンス（後方互換用に残す） */
export interface ExtractKnowledgeResponse {
  extracted: ExtractedKnowledgeItem[];
  duplicates: DuplicateKnowledgeItem[];
  totalProcessed: number;
}

// ============================================
// Phase 3-B: プレビュー・保存レスポンス
// ============================================

/** 抽出プレビュー候補（まだ保存されていない） */
export interface KnowledgeCandidate {
  content: string;
  category: string;
  tags: string[];
}

/** POST /knowledge/extract のレスポンス（プレビューのみ） */
export interface ExtractKnowledgePreviewResponse {
  candidates: KnowledgeCandidate[];
  totalProcessed: number;
}

/** POST /knowledge/save のレスポンス */
export interface SaveKnowledgeResponse {
  saved: ExtractedKnowledgeItem[];
  duplicates: DuplicateKnowledgeItem[];
}

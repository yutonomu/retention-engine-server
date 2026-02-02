// Knowledge Card source types (UX Spec 10.1)
export type KCSourceType = 'expert' | 'ai' | 'document' | 'merged';

// Knowledge Card lifecycle status
export type KCStatus = 'draft' | 'verified' | 'official';

export interface KnowledgeCard {
  id: string;
  title: string;
  content: string; // マークダウン (状況/ノウハウ/注意点)
  source_type: KCSourceType;
  status: KCStatus;
  creator_id: string;
  verifier_id: string | null;
  project_id: string | null;
  tags: string[];
  confidence: number | null;
  source_conversation_id: string | null;
  source_message_range: { start_index: number; end_index: number } | null;
  embedding: number[] | null;
  created_at: string;
  verified_at: string | null;
  view_count: number;
  useful_count: number;
}

// AIが会話から抽出するKC候補 (LLM出力形式)
export interface LlmKCCandidate {
  title: string;
  situation: string; // 状況
  knowhow: string; // ノウハウ
  precaution: string; // 注意点
  tags: string[];
  confidence: number; // 0.0~1.0
  source_message_range?: { start: number; end: number };
}

// FEに返すKC候補
export interface KCCandidate {
  title: string;
  situation: string;
  knowhow: string;
  precaution: string;
  tags: string[];
  confidence: number;
  sourceMessageRange?: { start: number; end: number };
}

// 類似KC (pgvector検索結果)
export interface SimilarKC {
  id: string;
  title: string;
  content: string;
  source_type: KCSourceType;
  status: KCStatus;
  tags: string[];
  similarity: number;
}

/**
 * KCCandidate → content マークダウンに合成
 */
export function composeKCContent(candidate: {
  situation: string;
  knowhow: string;
  precaution: string;
}): string {
  return `## 状況\n${candidate.situation}\n\n## ノウハウ\n${candidate.knowhow}\n\n## 注意点\n${candidate.precaution}`;
}

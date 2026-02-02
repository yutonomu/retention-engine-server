import type { KCCandidate, KCSourceType, KCStatus } from '../knowledge.types';

// POST /knowledge/detect-tacit レスポンス
export interface DetectTacitKnowledgeResponse {
  candidates: KCCandidate[];
}

// POST /knowledge/cards レスポンス
export interface SaveKnowledgeCardResponse {
  id: string;
  title: string;
  status: KCStatus;
  createdAt: string;
}

// GET /knowledge/cards レスポンス用 KC概要
export interface KCListItemResponse {
  id: string;
  title: string;
  content: string;
  sourceType: KCSourceType;
  status: KCStatus;
  tags: string[];
  confidence: number | null;
  createdAt: string;
  viewCount: number;
  usefulCount: number;
}

// GET /knowledge/cards/:id レスポンス
export interface KCDetailResponse {
  id: string;
  title: string;
  content: string;
  sourceType: KCSourceType;
  status: KCStatus;
  creatorId: string;
  verifierId: string | null;
  tags: string[];
  confidence: number | null;
  sourceConversationId: string | null;
  sourceMessageRange: { start_index: number; end_index: number } | null;
  createdAt: string;
  verifiedAt: string | null;
  viewCount: number;
  usefulCount: number;
}

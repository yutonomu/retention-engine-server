import type { KCCandidate, KCSourceType, KCStatus } from '../knowledge.types';
import type { TriggerType } from '../../message/message.types';

// POST /knowledge/detect-tacit レスポンス
export interface DetectTacitKnowledgeResponse {
  candidates: KCCandidate[];
}

// GET /knowledge/trigger-status/:conversationId レスポンス (Story 2-6)
export interface TriggerStatusResponse {
  shouldGenerateKC: boolean;
  totalTriggers: number;
  triggerSummary: Array<{
    triggerType: TriggerType;
    count: number;
    excerpts: string[];
  }>;
}

// POST /knowledge/detect-tacit-with-triggers レスポンス (Story 2-6)
export interface DetectTacitWithTriggersResponse {
  candidates: KCCandidate[];
  triggerContext: {
    totalTriggers: number;
    excerpts: string[];
  };
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
  questionCardId: string | null;
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
  questionCardId: string | null;
  sourceConversationId: string | null;
  sourceMessageRange: { start_index: number; end_index: number } | null;
  createdAt: string;
  verifiedAt: string | null;
  viewCount: number;
  usefulCount: number;
}

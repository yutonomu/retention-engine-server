import type { ExtractedKnowledge, SimilarKnowledge } from './knowledge.types';

export const KNOWLEDGE_PORT = Symbol('KNOWLEDGE_PORT');

export interface KnowledgeListQuery {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface KnowledgeListResult {
  items: ExtractedKnowledge[];
  total: number;
}

export interface KnowledgePort {
  /**
   * 抽出された知識を保存
   */
  save(knowledge: Omit<ExtractedKnowledge, 'id' | 'created_at'>): Promise<ExtractedKnowledge>;

  /**
   * ベクトル類似検索で重複候補を検索
   */
  findSimilar(
    embedding: number[],
    threshold?: number,
    limit?: number,
  ): Promise<SimilarKnowledge[]>;

  /**
   * IDで知識を取得
   */
  findById(id: string): Promise<ExtractedKnowledge | null>;

  /**
   * 会話IDで知識を取得
   */
  findByConversationId(conversationId: string): Promise<ExtractedKnowledge[]>;

  /**
   * 全知識を取得（フィルタ・ページネーション対応）
   */
  findAll(query: KnowledgeListQuery): Promise<KnowledgeListResult>;

  /**
   * 知識を更新（カテゴリ変更など）
   */
  update(id: string, data: { category?: string }): Promise<ExtractedKnowledge>;
}

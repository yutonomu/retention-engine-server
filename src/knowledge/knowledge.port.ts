import type {
  KnowledgeCard,
  KCStatus,
  KCSourceType,
  SimilarKC,
} from './knowledge.types';

export const KNOWLEDGE_PORT = Symbol('KNOWLEDGE_PORT');

export interface KCListQuery {
  status?: KCStatus;
  sourceType?: KCSourceType;
  creatorId?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface KCListResult {
  items: KnowledgeCard[];
  total: number;
}

export interface KnowledgePort {
  /**
   * ナレッジカードを保存
   */
  create(
    kc: Omit<
      KnowledgeCard,
      'id' | 'created_at' | 'verified_at' | 'view_count' | 'useful_count'
    >,
  ): Promise<KnowledgeCard>;

  /**
   * IDで取得
   */
  findById(id: string): Promise<KnowledgeCard | null>;

  /**
   * 一覧取得（フィルタ・ページネーション対応）
   */
  findAll(query: KCListQuery): Promise<KCListResult>;

  /**
   * 更新（内容・ステータス変更）
   */
  update(
    id: string,
    data: Partial<
      Pick<
        KnowledgeCard,
        | 'title'
        | 'content'
        | 'status'
        | 'tags'
        | 'embedding'
        | 'verifier_id'
        | 'verified_at'
      >
    >,
  ): Promise<KnowledgeCard>;

  /**
   * ベクトル類似検索で重複候補を検索
   */
  searchSimilar(
    embedding: number[],
    threshold?: number,
    limit?: number,
  ): Promise<SimilarKC[]>;

  /**
   * 閲覧数をインクリメント
   */
  incrementViewCount(id: string): Promise<void>;

  /**
   * 「役に立った」カウントをインクリメント
   */
  incrementUsefulCount(id: string): Promise<void>;
}

/**
 * 回答カード一覧取得用DTO
 */

export interface ListAnswerCardsQuery {
  /** 質問カードIDでフィルタ */
  questionCardId?: string;
  /** 作成者IDでフィルタ */
  creatorId?: string;
  /** キーワード検索 */
  search?: string;
  /** 取得件数（デフォルト: 20） */
  limit?: number;
  /** オフセット（デフォルト: 0） */
  offset?: number;
}

export interface ListAnswerCardsResponse {
  items: AnswerCardListItem[];
  total: number;
}

export interface AnswerCardListItem {
  id: string;
  questionCardId: string;
  content: string;
  originalContent: string | null;
  creatorId: string;
  creatorName?: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

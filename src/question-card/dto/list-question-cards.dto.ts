/**
 * 質問カード一覧取得DTO
 */

export type QuestionCardStatus = 'open' | 'resolved';

export interface ListQuestionCardsQuery {
  status?: string;
  search?: string;
  tags?: string;
  limit?: string;
  offset?: string;
}

export interface QuestionCardListItem {
  id: string;
  title: string;
  background: string;
  questionBody: string;
  status: QuestionCardStatus;
  creatorId: string;
  creatorName: string | null;
  isAnonymous: boolean;
  tags: string[];
  viewCount: number;
  createdAt: string;
}

export interface QuestionCardListResponse {
  items: QuestionCardListItem[];
  total: number;
}

export interface QuestionCardDetailResponse {
  id: string;
  title: string;
  background: string;
  questionBody: string;
  status: QuestionCardStatus;
  creatorId: string;
  creatorName: string | null;
  isAnonymous: boolean;
  tags: string[];
  sourceConvId: string | null;
  sourceMsgId: string | null;
  viewCount: number;
  createdAt: string;
}

/**
 * QuestionCard ポート（Hexagonal Architecture）
 */

import type { QuestionCardStatus } from './dto/list-question-cards.dto';

export const QUESTION_CARD_PORT = Symbol('QUESTION_CARD_PORT');

export interface QuestionCardRow {
  id: string;
  title: string;
  background: string;
  question_body: string;
  status: QuestionCardStatus;
  creator_id: string;
  is_anonymous: boolean;
  tags: string[];
  source_conv_id: string | null;
  source_msg_id: string | null;
  view_count: number;
  created_at: string;
}

export interface QCListQuery {
  status?: QuestionCardStatus;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface QCListResult {
  items: QuestionCardRow[];
  total: number;
}

export interface QuestionCardPort {
  create(
    qc: Omit<QuestionCardRow, 'id' | 'created_at' | 'view_count'>,
  ): Promise<QuestionCardRow>;

  findById(id: string): Promise<QuestionCardRow | null>;

  findAll(query: QCListQuery): Promise<QCListResult>;

  update(
    id: string,
    data: Partial<Pick<QuestionCardRow, 'title' | 'background' | 'question_body' | 'status' | 'tags'>>,
  ): Promise<QuestionCardRow>;

  incrementViewCount(id: string): Promise<void>;
}

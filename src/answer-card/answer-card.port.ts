/**
 * AnswerCard ポート（Hexagonal Architecture）
 */

export const ANSWER_CARD_PORT = Symbol('ANSWER_CARD_PORT');

export interface AnswerCardRow {
  id: string;
  question_card_id: string;
  content: string;
  original_content: string | null;
  creator_id: string;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface ACListQuery {
  questionCardId?: string;
  creatorId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ACListResult {
  items: AnswerCardRow[];
  total: number;
}

export interface AnswerCardPort {
  create(
    ac: Omit<AnswerCardRow, 'id' | 'created_at' | 'updated_at' | 'view_count'>,
  ): Promise<AnswerCardRow>;

  findById(id: string): Promise<AnswerCardRow | null>;

  findByQuestionCardId(questionCardId: string): Promise<AnswerCardRow[]>;

  findAll(query: ACListQuery): Promise<ACListResult>;

  update(
    id: string,
    data: Partial<Pick<AnswerCardRow, 'content' | 'original_content'>>,
  ): Promise<AnswerCardRow>;

  delete(id: string): Promise<void>;

  incrementViewCount(id: string): Promise<void>;
}

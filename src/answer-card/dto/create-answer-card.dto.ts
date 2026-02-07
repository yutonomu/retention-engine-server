/**
 * 回答カード作成用DTO
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AI対話による回答作成リクエスト
 */
export interface GenerateAnswerRequest {
  /** 対象の質問カードID */
  questionCardId: string;
  /** メンターが入力した回答内容 */
  mentorInput: string;
  /** AI対話履歴 */
  chatHistory: ChatMessage[];
}

/**
 * 回答カード候補（ナレッジカード形式）
 */
export interface AnswerCardCandidate {
  title: string;
  situation: string;
  knowhow: string;
  precaution: string;
  tags: string[];
  confidence: number;
  importance?: string;
  example?: string;
}

/**
 * 回答カード保存リクエスト（KC形式）
 */
export interface CreateAnswerCardRequest {
  /** 対象の質問カードID */
  questionCardId: string;
  /** KC候補データ */
  candidate: AnswerCardCandidate;
}

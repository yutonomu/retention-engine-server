/**
 * 質問カード作成・保存用DTO
 */

/** 1枚分の質問カード候補 */
export interface QuestionCardCandidate {
  title: string;
  background: string;
  questionBody: string;
  tags: string[];
  isAnonymous: boolean;
}

/** POST /question-cards リクエスト（複数カード一括保存） */
export interface CreateQuestionCardsRequest {
  cards: QuestionCardCandidate[];
  sourceConvId?: string;
  sourceMsgId?: string;
}

/** POST /question-cards/generate リクエスト */
export interface GenerateQuestionCardsRequest {
  /** 元のAI回答メッセージ内容 */
  originalAiMessage: string;
  /** 質問作成チャットの会話履歴 */
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 元の会話ID */
  sourceConvId?: string;
  /** 元のメッセージID */
  sourceMsgId?: string;
}

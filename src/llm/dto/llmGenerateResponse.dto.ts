/**
 * LLM Generate Response DTO
 *
 * Hybrid RAGシステムのレスポンスタイプ定義
 */

export enum ResponseType {
  ANSWER = 'ANSWER',
  WEB_SEARCH_CONFIRMATION = 'WEB_SEARCH_CONFIRMATION',
}

export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type ResponseSources = {
  fileSearch?: string[]; // ["onboarding-tips.txt", ...]
  webSearch?: WebSource[]; // [{ title: "...", url: "..." }]
};

// Web検索確認ボタンラベル
export type WebSearchConfirmationLabels = {
  confirm: string; // "はい" / "예" / "Yes"
  cancel: string; // "いいえ" / "아니오" / "No"
};

export type LlmGenerateResponseDto = {
  type: ResponseType;
  answer: string;

  // Web検索確認リクエスト時
  needsWebSearch?: boolean;
  webSearchReason?: string;
  confirmationLabels?: WebSearchConfirmationLabels;

  // 回答ソース
  sources?: ResponseSources;
};

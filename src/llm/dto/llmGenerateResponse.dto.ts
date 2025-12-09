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

/**
 * FileSearch Citation - Individual chunk reference
 * Represents a specific text chunk from a grounding source
 */
export type FileSearchChunk = {
  chunkId?: string; // Chunk identifier from Gemini
  text: string; // Referenced text snippet
  pageStart?: number; // Start page number (if available)
  pageEnd?: number; // End page number (if available)
  confidence?: number; // Confidence score (0-1)
};

/**
 * FileSearch Source - Document-level citation
 * Groups chunks by source file from Gemini groundingMetadata
 */
export type FileSearchSource = {
  fileName: string; // Original file name
  documentId?: string; // Gemini document identifier
  chunks: FileSearchChunk[]; // Referenced chunks from this file
};

export type ResponseSources = {
  // FileSearch citations with detailed chunk information
  // Upgraded from string[] to support rich citation data from Gemini groundingMetadata
  fileSearch?: FileSearchSource[];

  // Web search results (unchanged)
  webSearch?: WebSource[];
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

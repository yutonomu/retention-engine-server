/**
 * LLM Generate Response DTO
 *
 * Hybrid RAGシステムのレスポンスタイプ定義
 */

export enum ResponseType {
  ANSWER = 'ANSWER',
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

export type LlmGenerateResponseDto = {
  type: ResponseType;
  answer: string;
  sources?: ResponseSources; // 回答ソース（fileSearch, webSearch）
};

import type { Message } from '../../Entity/Message';
import type { UUID } from '../../common/uuid';
import type { SearchSettings } from '../dto/llmGenerateRequest.dto';
import type { FileSearchSource, WebSource } from '../dto/llmGenerateResponse.dto';

export type FileSearchAnswerOptions = {
  conversationId: UUID;
  history?: Message[];
  systemInstruction?: string;
  searchSettings?: SearchSettings; // User-Controlled Search用
  geminiCacheName?: string; // Gemini Context Caching（トークンコスト削減）
};

/**
 * FileSearch結果の出典情報
 * HybridRagAssistantとの互換性のためにネスト構造を採用
 */
export type FileSearchSources = {
  fileSearch?: FileSearchSource[];
  webSearch?: WebSource[]; // HybridRagAssistantでのみ使用
};

export type FileSearchAnswerResult = {
  answer: string;
  message: Message;
  sources?: FileSearchSources; // Citation sources from Gemini groundingMetadata
};

export type FileDocument = {
  id: UUID;
  filePath: string;
  displayName: string;
  mimeType: string;
};

export abstract class FileSearchAssistant {
  abstract answerQuestion(
    question: string,
    options: FileSearchAnswerOptions,
  ): Promise<FileSearchAnswerResult>;

  abstract uploadDocuments(documents: FileDocument[]): Promise<void>;
}

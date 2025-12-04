import type { Message } from '../../Entity/Message';
import type { UUID } from '../../common/uuid';
import type { SearchSettings } from '../dto/llmGenerateRequest.dto';

export type FileSearchAnswerOptions = {
  conversationId: UUID;
  history?: Message[];
  systemInstruction?: string;
  searchSettings?: SearchSettings; // User-Controlled Search用
  geminiCacheName?: string; // Gemini Context Caching（トークンコスト削減）
};

export type FileSearchAnswerResult = {
  answer: string;
  message: Message;
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

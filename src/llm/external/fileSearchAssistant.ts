import type { Message } from '../../Entity/Message';
import type { UUID } from '../../common/uuid';

export type FileSearchAnswerOptions = {
  conversationId: UUID;
  history?: Message[];
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

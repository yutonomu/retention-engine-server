import type { Message } from '../../../Entity/Message';
import type { UUID } from '../../../common/uuid';

export type FileSeed = {
  path: string;
  displayName: string;
  mimeType?: string;
};

export type StoreSeed = {
  displayName: string;
  files: FileSeed[];
  existingName?: string;
  questions?: string[];
};

export type StoreRegistry = Record<string, string>;

export type GeminiFileSearchAssistantOptions = {
  storeSeeds: StoreSeed[];
};

export type PrepareStoresOptions = {
  importFiles?: boolean;
  forceImport?: boolean;
};

export type AnswerQuestionOptions = {
  conversationId: UUID;
  history?: Message[];
};

export type AnswerQuestionResult = {
  answer: string;
  messages: Message[];
};

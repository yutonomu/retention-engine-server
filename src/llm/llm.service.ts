import { Inject, Injectable, Logger } from '@nestjs/common';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import {
  FileSearchAssistant,
  type FileDocument,
} from './external/fileSearchAssistant';
import type { Message } from '../Entity/Message';
import { createUUID } from '../common/uuid';
import { DocumentUploadRepository } from './repositories/documentUploadRepository';
import type { UUID } from '../common/uuid';
import * as path from 'path';
import { MessageService } from '../message/message.service';

export type LlmGenerateCommand = {
  prompt: string;
  conversationId: UUID;
};

export type LlmGenerateResult = {
  answer: string;
  message: Message;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly historyStore: JsonMessageDataAccess,
    private readonly documentUploadRepository: DocumentUploadRepository,
    private readonly messageService: MessageService,
    @Inject(FileSearchAssistant)
    private readonly fileSearchAssistant: FileSearchAssistant,
  ) {}

  async generate(command: LlmGenerateCommand): Promise<LlmGenerateResult> {
    this.logger.log(
      `Processing LLM generate command=${JSON.stringify(command)}`,
    );

    const history = await this.historyStore.fetchMessages(
      command.conversationId,
    );
    this.logger.log(
      `Loaded conversation history conversationId="${command.conversationId}" messages=${JSON.stringify(
        history,
      )}`,
    );

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'NEW_HIRE',
      content: command.prompt,
      createdAt: new Date(),
    };
    await this.historyStore.saveMessages(command.conversationId, [userMessage]);
    this.persistSingleMessage(
      command.conversationId,
      'NEW_HIRE',
      command.prompt,
    );

    const llmResult = await this.fileSearchAssistant.answerQuestion(
      command.prompt,
      {
        conversationId: command.conversationId,
        history: [...history, userMessage],
      },
    );

    await this.historyStore.saveMessages(command.conversationId, [
      llmResult.message,
    ]);
    this.logger.log(
      `Appended assistant message to conversationId="${command.conversationId}" message=${JSON.stringify(
        llmResult.message,
      )}`,
    );

    this.persistSingleMessage(
      command.conversationId,
      'ASSISTANT',
      llmResult.message.content,
    );

    return llmResult;
  }

  async uploadPendingDocuments(): Promise<number> {
    const pendingDocuments =
      await this.documentUploadRepository.getPendingDocuments();
    if (!pendingDocuments.length) {
      this.logger.log('No pending documents to upload.');
      return 0;
    }

    const fileDocuments: FileDocument[] = pendingDocuments.map((doc) => ({
      id: doc.id,
      filePath: doc.filePath,
      displayName: this.extractDisplayName(doc.filePath),
      mimeType: this.detectMimeType(doc.filePath),
    }));

    await this.fileSearchAssistant.uploadDocuments(fileDocuments);
    await this.documentUploadRepository.markDocumentsUploaded(
      pendingDocuments.map((doc) => doc.id),
    );

    this.logger.log(
      `Uploaded ${pendingDocuments.length} pending documents to FileSearch.`,
    );
    return pendingDocuments.length;
  }

  private extractDisplayName(filePath: string): string {
    return path.basename(filePath);
  }

  private detectMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.txt':
        return 'text/plain';
      case '.pdf':
        return 'application/pdf';
      case '.md':
        return 'text/markdown';
      case '.json':
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }

  private persistSingleMessage(
    convId: string,
    role: 'NEW_HIRE' | 'ASSISTANT',
    content: string,
  ) {
    try {
      this.messageService.createMessage({
        convId,
        role,
        content,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist ${role} message for conversation=${convId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

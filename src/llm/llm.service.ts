import { Inject, Injectable, Logger } from '@nestjs/common';
import * as messagePort from '../message/message.port';
import { MESSAGE_PORT } from '../message/message.port';
import { USER_PORT } from '../user/user.port';
import type { UserPort } from '../user/user.port';
import { CONVERSATION_PORT } from '../conversation/conversation.port';
import type { ConversationPort } from '../conversation/conversation.port';
import {
  FileSearchAssistant,
  type FileDocument,
} from './external/fileSearchAssistant';
import type { Message } from '../Entity/Message';
import { createUUID } from '../common/uuid';
import type { UUID } from '../common/uuid';
import * as path from 'path';
import { MBTI_COMMUNICATION_STYLES } from '../user/mbti.types';

export type LlmGenerateCommand = {
  prompt: string;
  conversationId: UUID;
};

export type LlmGenerateResult = {
  answer: string;
  message: Message;
};

export type UploadDocumentCommand = {
  filePath: string;
  displayName?: string;
  mimeType?: string;
  id?: UUID;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(MESSAGE_PORT)
    private readonly messagePort: messagePort.MessagePort,
    @Inject(FileSearchAssistant)
    private readonly fileSearchAssistant: FileSearchAssistant,
    @Inject(USER_PORT)
    private readonly userPort: UserPort,
    @Inject(CONVERSATION_PORT)
    private readonly conversationPort: ConversationPort,
  ) { }

  async generate(command: LlmGenerateCommand): Promise<LlmGenerateResult> {
    this.logger.log(
      `Processing LLM generate command=${JSON.stringify(command)}`,
    );

    const history = await this.messagePort.findAllByConversation(
      command.conversationId.toString(),
    );

    this.logger.log(
      `Loaded conversation history conversationId="${command.conversationId}" messages=${JSON.stringify(
        history,
      )}`,
    );

    // Fetch MBTI information for the conversation owner
    const conversation = await this.conversationPort.findById(
      command.conversationId.toString(),
    );
    if (!conversation) {
      throw new Error(`Conversation ${command.conversationId} not found`);
    }
    if (!conversation.owner_id) {
      throw new Error(`Conversation ${command.conversationId} has no owner`);
    }

    let systemInstruction: string | undefined;
    const userMbti = await this.userPort.getUserMbti(conversation.owner_id);

    if (userMbti) {
      const communicationStyle = MBTI_COMMUNICATION_STYLES[userMbti];
      systemInstruction = `このユーザーのMBTIタイプは${userMbti}です。${communicationStyle}`;
      this.logger.log(
        `MBTI personalization applied: type=${userMbti} for userId=${conversation.owner_id}`,
      );
    }

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'NEW_HIRE',
      content: command.prompt,
      createdAt: new Date(),
    };

    let llmResult: { answer: string; message: Message };
    try {
      llmResult = await this.fileSearchAssistant.answerQuestion(
        command.prompt,
        {
          conversationId: command.conversationId,
          history: [...(history as unknown as Message[]), userMessage],
          systemInstruction,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate answer via FileSearchAssistant conversationId="${command.conversationId}"`,
        error as Error,
      );
      const fallbackMessage: Message = {
        messageId: createUUID(),
        conversationId: command.conversationId,
        userRole: 'ASSISTANT',
        content:
          '申し訳ありません、現在回答を生成できませんでした。しばらくしてから再度お試しください。',
        createdAt: new Date(),
      };
      llmResult = {
        answer: fallbackMessage.content,
        message: fallbackMessage,
      };
    }

    this.logger.log(
      `Appended assistant message to conversationId="${command.conversationId}" message=${JSON.stringify(
        llmResult.message,
      )}`,
    );

    return llmResult;
  }

  async uploadDocument(command: UploadDocumentCommand): Promise<void> {
    const fileDocument: FileDocument = {
      id: command.id ?? createUUID(),
      filePath: command.filePath,
      displayName:
        command.displayName ?? this.extractDisplayName(command.filePath),
      mimeType: command.mimeType ?? this.detectMimeType(command.filePath),
    };

    await this.fileSearchAssistant.uploadDocuments([fileDocument]);
    this.logger.log(
      `Uploaded document to FileSearch: displayName="${fileDocument.displayName}" path="${fileDocument.filePath}"`,
    );
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
}

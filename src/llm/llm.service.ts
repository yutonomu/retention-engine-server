import { Injectable, Logger } from '@nestjs/common';
import { ConversationHistoryRepository } from './repositories/conversation-history.repository';
import { MultiStoreChatService } from './external/multi-store-chat/multi-store-chat.service';
import type { Message } from '../Entity/Message';
import type { UUID } from '../common/uuid';

export type LlmGenerateCommand = {
  prompt: string;
  conversationId?: UUID;
};

export type LlmGenerateResult = {
  answer: string;
  messages: Message[];
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly historyStore: ConversationHistoryRepository,
    private readonly multiStoreChat: MultiStoreChatService,
  ) {}

  async generate(command: LlmGenerateCommand): Promise<LlmGenerateResult> {
    this.logger.log(
      `Processing LLM generate command=${JSON.stringify(command)}`,
    );

    let history: Message[] = [];

    if (command.conversationId) {
      history = await this.historyStore.fetchMessages(command.conversationId);
      this.logger.log(
        `Loaded conversation history conversationId="${command.conversationId}" messages=${JSON.stringify(
          history,
        )}`,
      );
    } else {
      this.logger.log('No conversationId provided; skipping history lookup.');
    }

    const llmResult = await this.multiStoreChat.answerQuestion(command.prompt, {
      conversationId: command.conversationId,
      history,
    });

    if (command.conversationId) {
      await this.historyStore.saveMessages(
        command.conversationId,
        llmResult.messages,
      );
      this.logger.log(
        `Appended new messages to conversationId="${command.conversationId}" messages=${JSON.stringify(
          llmResult.messages,
        )}`,
      );
    } else {
      this.logger.log(
        'Skipping history append because conversationId is missing.',
      );
    }

    return llmResult;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { FileSearchAssistant } from './external/fileSearchAssistant';
import type { Message } from '../Entity/Message';
import { createUUID } from '../common/uuid';
import type { UUID } from '../common/uuid';

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

    const llmResult = await this.fileSearchAssistant.answerQuestion(
      command.prompt,
      {
        conversationId: command.conversationId,
        history,
      },
    );

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'NEW_HIRE',
      content: command.prompt,
      createdAt: new Date(),
    };
    await this.historyStore.saveMessages(command.conversationId, [
      userMessage,
      llmResult.message,
    ]);
    this.logger.log(
      `Appended new messages to conversationId="${command.conversationId}" messages=${JSON.stringify(
        [userMessage, llmResult.message],
      )}`,
    );

    return llmResult;
  }
}

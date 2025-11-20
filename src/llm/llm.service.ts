import { Injectable, Logger } from '@nestjs/common';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { GeminiFileSearchAssistantService } from './external/geminiFileSearchAssistant/geminiFileSearchAssistant.service';
import type { Message } from '../Entity/Message';
import type { UUID } from '../common/uuid';

export type LlmGenerateCommand = {
  prompt: string;
  conversationId: UUID;
};

export type LlmGenerateResult = {
  answer: string;
  messages: Message[];
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly historyStore: JsonMessageDataAccess,
    private readonly fileSearchAssistant: GeminiFileSearchAssistantService,
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

    await this.historyStore.saveMessages(
      command.conversationId,
      llmResult.messages,
    );
    this.logger.log(
      `Appended new messages to conversationId="${command.conversationId}" messages=${JSON.stringify(
        llmResult.messages,
      )}`,
    );

    return llmResult;
  }
}

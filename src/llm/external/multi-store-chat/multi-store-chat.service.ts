import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { MultiStoreChat } from './multi-store-chat';
import { defaultMultiStoreChatOptions } from './multi-store-chat.config';
import type {
  AnswerQuestionOptions,
  AnswerQuestionResult,
} from './multi-store-chat.types';

@Injectable()
export class MultiStoreChatService implements OnModuleInit {
  private readonly logger = new Logger(MultiStoreChatService.name);

  private client: MultiStoreChat | null = null;

  async onModuleInit(): Promise<void> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. MultiStoreChat integration is disabled.',
      );
      return;
    }

    this.client = new MultiStoreChat(defaultMultiStoreChatOptions, apiKey);

    try {
      await this.client.prepareStores();
      this.logger.log('MultiStoreChat stores are ready.');
    } catch (error) {
      this.logger.error('Failed to prepare MultiStoreChat stores.', error);
      this.client = null;
    }
  }

  async answerQuestion(
    question: string,
    options?: AnswerQuestionOptions,
  ): Promise<AnswerQuestionResult> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'MultiStoreChat client is not initialized.',
      );
    }

    return this.client.answerQuestion(question, options);
  }
}

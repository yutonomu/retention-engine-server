import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { GeminiFileSearchAssistant } from './geminiFileSearchAssistant';
import { defaultGeminiFileSearchAssistantOptions } from './geminiFileSearchAssistant.config';
import type {
  AnswerQuestionOptions,
  AnswerQuestionResult,
} from './geminiFileSearchAssistant.types';

@Injectable()
export class GeminiFileSearchAssistantService implements OnModuleInit {
  private readonly logger = new Logger(GeminiFileSearchAssistantService.name);

  private client: GeminiFileSearchAssistant | null = null;

  async onModuleInit(): Promise<void> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. GeminiFileSearchAssistant is disabled.',
      );
      return;
    }

    this.client = new GeminiFileSearchAssistant(
      defaultGeminiFileSearchAssistantOptions,
      apiKey,
    );

    try {
      await this.client.prepareStores();
      this.logger.log('Gemini FileSearch stores are ready.');
    } catch (error) {
      this.logger.error(
        'Failed to prepare Gemini FileSearch stores.',
        error,
      );
      this.client = null;
    }
  }

  async answerQuestion(
    question: string,
    options?: AnswerQuestionOptions,
  ): Promise<AnswerQuestionResult> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'GeminiFileSearchAssistant client is not initialized.',
      );
    }

    return this.client.answerQuestion(question, options);
  }
}

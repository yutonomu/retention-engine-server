import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { GeminiFileSearchClient } from './geminiFileSearchClient';
import { defaultGeminiFileSearchAssistantOptions } from './geminiFileSearchAssistant.config';
import type {
  FileDocument,
  FileSearchAnswerOptions,
  FileSearchAnswerResult,
} from '../fileSearchAssistant';
import { FileSearchAssistant } from '../fileSearchAssistant';

@Injectable()
export class GeminiFileSearchAssistantService
  extends FileSearchAssistant
  implements OnModuleInit
{
  private readonly logger = new Logger(GeminiFileSearchAssistantService.name);

  private client: GeminiFileSearchClient | null = null;

  async onModuleInit(): Promise<void> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. GeminiFileSearchAssistant is disabled.',
      );
      return;
    }

    this.client = new GeminiFileSearchClient(
      defaultGeminiFileSearchAssistantOptions,
      apiKey,
    );

    try {
      await this.client.prepareStores();
      this.logger.log('Gemini FileSearch stores are ready.');
    } catch (error) {
      this.logger.error('Failed to prepare Gemini FileSearch stores.', error);
      this.client = null;
    }

    console.log('GeminiFileSearchAssistantService initialized');
  }

  async answerQuestion(
    question: string,
    options: FileSearchAnswerOptions,
  ): Promise<FileSearchAnswerResult> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'GeminiFileSearchAssistant client is not initialized.',
      );
    }

    return this.client.answerQuestion(question, options);
  }

  async uploadDocuments(documents: FileDocument[]): Promise<void> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'GeminiFileSearchAssistant client is not initialized.',
      );
    }

    await this.client.uploadDocuments(documents);
  }
}

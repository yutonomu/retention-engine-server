import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { GeminiFileSearchAssistantService } from './external/geminiFileSearchAssistant/geminiFileSearchAssistantService';
import { FileSearchAssistant } from './external/fileSearchAssistant';
import { DocumentUploadRepository } from './repositories/documentUploadRepository';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  controllers: [LlmController],
  providers: [
    LlmService,
    JsonMessageDataAccess,
    DocumentUploadRepository,
    {
      provide: FileSearchAssistant,
      useClass: GeminiFileSearchAssistantService,
    },
  ],
})
export class LlmModule {}

import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { GeminiFileSearchAssistantService } from './external/geminiFileSearchAssistant/geminiFileSearchAssistantService';
import { FileSearchAssistant } from './external/fileSearchAssistant';
import { MessageModule } from '../message/message.module';
import { GeminiTextService } from './external/geminiTextService';

@Module({
  imports: [MessageModule],
  controllers: [LlmController],
  providers: [
    LlmService,
    JsonMessageDataAccess,
    GeminiTextService,
    {
      provide: FileSearchAssistant,
      useClass: GeminiFileSearchAssistantService,
    },
  ],
  exports: [LlmService, GeminiTextService],
})
export class LlmModule {}

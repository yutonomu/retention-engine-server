import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { GeminiFileSearchAssistantService } from './external/geminiFileSearchAssistant/geminiFileSearchAssistantService';
import { FileSearchAssistant } from './external/fileSearchAssistant';

@Module({
  controllers: [LlmController],
  providers: [
    LlmService,
    JsonMessageDataAccess,
    {
      provide: FileSearchAssistant,
      useClass: GeminiFileSearchAssistantService,
    },
  ],
})
export class LlmModule {}

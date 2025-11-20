import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { GeminiFileSearchAssistantService } from './external/geminiFileSearchAssistant/geminiFileSearchAssistant.service';

@Module({
  controllers: [LlmController],
  providers: [
    LlmService,
    JsonMessageDataAccess,
    GeminiFileSearchAssistantService,
  ],
})
export class LlmModule {}

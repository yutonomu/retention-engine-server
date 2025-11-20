import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { MultiStoreChatService } from './external/multi-store-chat/multi-store-chat.service';

@Module({
  controllers: [LlmController],
  providers: [LlmService, JsonMessageDataAccess, MultiStoreChatService],
})
export class LlmModule {}

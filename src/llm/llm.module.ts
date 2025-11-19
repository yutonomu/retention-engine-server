import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { ConversationHistoryRepository } from './repositories/conversation-history.repository';

@Module({
  controllers: [LlmController],
  providers: [LlmService, ConversationHistoryRepository],
})
export class LlmModule {}

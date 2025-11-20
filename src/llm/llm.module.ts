import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { ConversationHistoryRepository } from './repositories/conversation-history.repository';
import { MultiStoreChatService } from './external/multi-store-chat/multi-store-chat.service';

@Module({
  controllers: [LlmController],
  providers: [LlmService, ConversationHistoryRepository, MultiStoreChatService],
})
export class LlmModule {}

import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageRepository } from './repositories/message.repository';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  controllers: [MessageController],
  providers: [MessageService, MessageRepository],
  exports: [MessageService],
})
export class MessageModule {}

import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ConversationRepository } from './repositories/conversation.repository';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [ConversationService, ConversationRepository],
  controllers: [ConversationController],
  exports: [ConversationService],
})
export class ConversationModule {}

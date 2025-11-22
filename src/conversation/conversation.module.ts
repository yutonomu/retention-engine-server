import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ConversationRepository } from './repositories/conversation.repository';
import { UserModule } from '../user/user.module';
import { CONVERSATION_PORT } from './conversation.port';
import { MentorAssignmentModule } from '../mentor-assignment/mentor-assignment.module';

@Module({
  imports: [UserModule, MentorAssignmentModule],
  providers: [
    ConversationService,
    {
      provide: CONVERSATION_PORT,
      useClass: ConversationRepository,
    },
  ],
  controllers: [ConversationController],
  exports: [ConversationService, CONVERSATION_PORT],
})
export class ConversationModule {}

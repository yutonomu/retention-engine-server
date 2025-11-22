import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ConversationRepository } from './repositories/conversation.repository';
import { UserModule } from '../user/user.module';
import { MentorAssignmentRepository } from '../mentor-assignment/mentor-assignment.repository';

@Module({
  imports: [UserModule],
  providers: [
    ConversationService,
    ConversationRepository,
    MentorAssignmentRepository,
  ],
  controllers: [ConversationController],
  exports: [ConversationService, ConversationRepository],
})
export class ConversationModule {}

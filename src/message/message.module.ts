import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageRepository } from './repositories/message.repository';
import { ConversationModule } from '../conversation/conversation.module';
import { MentorAssignmentModule } from '../mentor-assignment/mentor-assignment.module';
import { MESSAGE_PORT } from './message.port';

@Module({
  imports: [ConversationModule, MentorAssignmentModule],
  controllers: [MessageController],
  providers: [
    MessageService,
    {
      provide: MESSAGE_PORT,
      useClass: MessageRepository,
    },
  ],
  exports: [MessageService],
})
export class MessageModule {}

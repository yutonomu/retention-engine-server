import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRepository } from './repositories/feedback.repository';
import { MessageRepository } from '../message/repositories/message.repository';
import { FEEDBACK_PORT } from './feedback.port';
import { MESSAGE_PORT } from '../message/message.port';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    {
      provide: FEEDBACK_PORT,
      useClass: FeedbackRepository,
    },
    {
      provide: MESSAGE_PORT,
      useClass: MessageRepository,
    },
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}

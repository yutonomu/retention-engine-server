import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRepository } from './repositories/feedback.repository';
import { MessageRepository } from '../message/repositories/message.repository';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRepository, MessageRepository],
  exports: [FeedbackService],
})
export class FeedbackModule {}

import { BadRequestException, Injectable } from '@nestjs/common';
import { FeedbackRepository } from './repositories/feedback.repository';
import type { Feedback } from './feedback.types';
import { MessageRepository } from '../message/repositories/message.repository';

interface CreateFeedbackParams {
  messageId: string;
  authorId: string;
  content: string;
}

export interface FeedbackListResult {
  items: Feedback[];
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  getFeedbackByMessage(messageId: string): FeedbackListResult {
    if (!messageId?.trim()) {
      throw new BadRequestException('messageId is required');
    }
    const message = this.messageRepository.findById(messageId);
    const items = this.feedbackRepository.findByMessageId(message.msg_id);
    return { items };
  }

  createFeedback(input: CreateFeedbackParams): Feedback {
    if (!input.messageId?.trim()) {
      throw new BadRequestException('messageId is required');
    }
    const message = this.messageRepository.findById(input.messageId);
    const content = input.content?.trim();
    if (!content) {
      throw new BadRequestException('content must not be empty');
    }
    if (!input.authorId?.trim()) {
      throw new BadRequestException('authorId is required');
    }
    return this.feedbackRepository.createFeedback({
      target_msg_id: message.msg_id,
      author_id: input.authorId,
      content,
    });
  }
}

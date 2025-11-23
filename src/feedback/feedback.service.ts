import { Inject, BadRequestException, Injectable } from '@nestjs/common';
import type { Feedback } from './feedback.types';
import type { FeedbackPort } from './feedback.port';
import type { MessagePort } from '../message/message.port';

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
    @Inject('FEEDBACK_PORT')
    private readonly feedbackRepository: FeedbackPort,
    @Inject('MESSAGE_PORT')
    private readonly messageRepository: MessagePort,
  ) {}

  async getFeedbackByMessage(messageId: string): Promise<FeedbackListResult> {
    if (!messageId?.trim()) {
      throw new BadRequestException('messageId is required');
    }

    // TODO: messageいらないんじゃ？
    const message = await this.messageRepository.findById(messageId);
    const items = await this.feedbackRepository.findByMessageId(message.msg_id);
    return { items };
  }

  async createFeedback(input: CreateFeedbackParams): Promise<Feedback> {
    if (!input.messageId?.trim()) {
      throw new BadRequestException('messageId is required');
    }
    const message = await this.messageRepository.findById(input.messageId);
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
      author_role: 'MENTOR',
      content,
    });
  }
}

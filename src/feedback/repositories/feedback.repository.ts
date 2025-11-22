import { Injectable } from '@nestjs/common';
import { feedbackData } from '../data/feedback.data';
import type { Feedback } from '../feedback.types';

@Injectable()
export class FeedbackRepository {
  private readonly store: Feedback[] = [...feedbackData];

  findByMessageId(messageId: string): Feedback[] {
    return this.store
      .filter((feedback) => feedback.target_msg_id === messageId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  createFeedback(input: { target_msg_id: string; author_id: string; content: string }): Feedback {
    const feedback: Feedback = {
      fb_id: `fb-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      target_msg_id: input.target_msg_id,
      author_id: input.author_id,
      content: input.content,
      created_at: new Date(),
    };
    this.store.push(feedback);
    return feedback;
  }
}

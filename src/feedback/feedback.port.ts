import type { Feedback } from './feedback.types';

export interface FeedbackPort {
  findByMessageId(messageId: string): Promise<Feedback[]>;
  createFeedback(input: {
    target_msg_id: string;
    author_id: string;
    author_role?: 'MENTOR' | 'NEW_HIRE';
    content: string;
  }): Promise<Feedback>;
}

export const FEEDBACK_PORT = 'FEEDBACK_PORT';

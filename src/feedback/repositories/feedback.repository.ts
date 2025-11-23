import { Inject, Injectable } from '@nestjs/common';
import type { Feedback } from '../feedback.types';
import { randomUUID } from 'crypto';
import type { FeedbackPort } from '../feedback.port';
import type { SupabaseAdminClient } from '../../supabase/adminClient';

@Injectable()
export class FeedbackRepository implements FeedbackPort {
  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
  ) {}

  async findByMessageId(messageId: string): Promise<Feedback[]> {
    const { data, error } = await this.supabase
      .from('feedback')
      .select()
      .eq('target_msg_id', messageId)
      .order('created_at', { ascending: true })
      .order('fb_id', { ascending: true });
    if (error || !data) {
      throw error ?? new Error('Failed to fetch feedbacks.');
    }
    return data as unknown as Feedback[];
  }

  async createFeedback(input: {
    target_msg_id: string;
    author_id: string;
    content: string;
    author_role?: 'MENTOR' | 'NEW_HIRE';
  }): Promise<Feedback> {
    const fbId = randomUUID();
    const { data, error } = await this.supabase
      .from('feedback')
      .insert({
        fb_id: fbId,
        target_msg_id: input.target_msg_id,
        author_id: input.author_id,
        author_role: input.author_role ?? 'MENTOR',
        content: input.content,
      })
      .select()
      .single();
    if (error || !data) {
      throw error ?? new Error('Failed to create feedback.');
    }
    return data as unknown as Feedback;
  }
}

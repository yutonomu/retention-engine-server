import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Message } from '../message.types';
import { randomUUID } from 'crypto';
import type { MessagePort } from '../message.port';
import type { SupabaseAdminClient } from '../../supabase/adminClient';

@Injectable()
export class MessageRepository implements MessagePort {
  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
  ) {}

  async findById(messageId: string): Promise<Message> {
    const { data, error } = await this.supabase
      .from('message')
      .select()
      .eq('msg_id', messageId)
      .single();
    if (error || !data) {
      throw new NotFoundException(`Message ${messageId} not found.`);
    }
    return data as unknown as Message;
  }

  async findAllByConversation(convId: string): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from('message')
      .select()
      .eq('conv_id', convId)
      .order('created_at', { ascending: true })
      .order('msg_id', { ascending: true });
    if (error || !data) {
      throw error ?? new Error('Failed to fetch messages.');
    }
    return data as unknown as Message[];
  }

  async createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
  }): Promise<Message> {
    const msgId = randomUUID();
    const { data, error } = await this.supabase
      .from('message')
      .insert({
        msg_id: msgId,
        conv_id: input.convId,
        role: input.role,
        content: input.content,
        status: input.role === 'ASSISTANT' ? 'DONE' : null,
      })
      .select()
      .single();
    if (error || !data) {
      throw error ?? new Error('Failed to create message.');
    }
    return data as unknown as Message;
  }
}

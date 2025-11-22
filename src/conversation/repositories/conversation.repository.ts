import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Conversation, ConversationState } from '../conversation.types';
import type { ConversationPort } from '../conversation.port';

@Injectable()
export class ConversationRepository implements ConversationPort {
  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseClient,
  ) {}

  async create(ownerId: string, title: string): Promise<Conversation> {
    const now = new Date().toISOString();
    const convId = randomUUID();
    const { data, error } = await this.supabase
      .from('conversation')
      .insert({
        conv_id: convId,
        owner_id: ownerId,
        title,
        state: 'ACTIVE',
        created_at: now,
        last_active_at: now,
      })
      .select()
      .single();
    if (error || !data) {
      throw error ?? new Error('Failed to create conversation.');
    }
    return data as unknown as Conversation;
  }

  async findByOwner(ownerId: string): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from('conversation')
      .select()
      .eq('owner_id', ownerId)
      .order('last_active_at', { ascending: false })
      .order('conv_id', { ascending: false });
    if (error || !data) {
      throw error ?? new Error('Failed to fetch conversations by owner.');
    }
    return data as unknown as Conversation[];
  }

  async findByState(state: ConversationState): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from('conversation')
      .select()
      .eq('state', state.toUpperCase());
    if (error || !data) {
      throw error ?? new Error('Failed to fetch conversations by state.');
    }
    return data as unknown as Conversation[];
  }

  async findById(convId: string): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversation')
      .select()
      .eq('conv_id', convId)
      .single();
    if (error || !data) {
      throw new NotFoundException(`Conversation ${convId} not found.`);
    }
    return data as unknown as Conversation;
  }

  async findActiveByOwners(ownerIds: string[]): Promise<Conversation[]> {
    if (!ownerIds.length) {
      return [];
    }
    const { data, error } = await this.supabase
      .from('conversation')
      .select()
      .in('owner_id', ownerIds)
      .eq('state', 'ACTIVE');
    if (error || !data) {
      throw error ?? new Error('Failed to fetch active conversations.');
    }
    return data as unknown as Conversation[];
  }
}

import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Message, TriggerType } from '../message.types';
import { randomUUID } from 'crypto';
import type {
  MessagePort,
  PaginatedMessages,
  TriggerAggregation,
} from '../message.port';
import type { SupabaseAdminClient } from '../../supabase/adminClient';

const DEFAULT_MESSAGE_LIMIT = 30;

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

  /**
   * ページネーション付きメッセージ取得
   * チャット向け: 最新メッセージから開始し、上スクロールで過去を取得
   */
  async findByConversationPaginated(
    convId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<PaginatedMessages> {
    const limit = options.limit ?? DEFAULT_MESSAGE_LIMIT;

    let query = this.supabase
      .from('message')
      .select()
      .eq('conv_id', convId)
      .order('created_at', { ascending: false })
      .order('msg_id', { ascending: false })
      .limit(limit + 1);

    if (options.cursor) {
      query = query.lt('created_at', options.cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(
        `メッセージの取得に失敗しました: ${error.message}`,
      );
    }

    const messages = (data ?? []) as unknown as Message[];
    const hasMore = messages.length > limit;

    const items = hasMore ? messages.slice(0, limit) : messages;

    const oldestCreatedAt = items[items.length - 1]?.created_at;
    const nextCursor =
      hasMore && items.length > 0 && oldestCreatedAt
        ? typeof oldestCreatedAt === 'string'
          ? oldestCreatedAt
          : String(oldestCreatedAt)
        : undefined;

    items.reverse();

    return {
      items,
      hasMore,
      nextCursor,
    };
  }

  async createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
    triggerType?: TriggerType | null;
    triggerConfidence?: number | null;
    triggerExcerpt?: string | null;
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
        // Story 2-6: トリガーメタデータ
        trigger_type: input.triggerType ?? null,
        trigger_confidence: input.triggerConfidence ?? null,
        trigger_excerpt: input.triggerExcerpt ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      throw error ?? new Error('Failed to create message.');
    }
    return data as unknown as Message;
  }

  /**
   * 会話内のトリガー集計 (Story 2-6)
   * KC生成のトリガー条件チェック用
   */
  async aggregateTriggersByConversation(
    convId: string,
  ): Promise<TriggerAggregation[]> {
    const { data, error } = await this.supabase
      .from('message')
      .select('trigger_type, trigger_excerpt')
      .eq('conv_id', convId)
      .not('trigger_type', 'is', null);

    if (error) {
      throw new BadRequestException(
        `トリガー集計に失敗しました: ${error.message}`,
      );
    }

    // グループ化して集計
    const aggregation = new Map<
      TriggerType,
      { count: number; excerpts: string[] }
    >();

    for (const row of data ?? []) {
      const triggerType = row.trigger_type as TriggerType;
      const triggerExcerpt = row.trigger_excerpt as string | null;
      if (!aggregation.has(triggerType)) {
        aggregation.set(triggerType, { count: 0, excerpts: [] });
      }
      const entry = aggregation.get(triggerType)!;
      entry.count += 1;
      if (triggerExcerpt) {
        entry.excerpts.push(triggerExcerpt);
      }
    }

    return Array.from(aggregation.entries()).map(
      ([triggerType, { count, excerpts }]) => ({
        triggerType,
        count,
        excerpts,
      }),
    );
  }
}

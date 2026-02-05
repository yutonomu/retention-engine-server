import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  QuestionCardPort,
  QuestionCardRow,
  QCListQuery,
  QCListResult,
} from './question-card.port';
import type { SupabaseAdminClient } from '../supabase/adminClient';

@Injectable()
export class QuestionCardRepository implements QuestionCardPort {
  private readonly logger = new Logger(QuestionCardRepository.name);

  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
  ) {}

  async create(
    qc: Omit<QuestionCardRow, 'id' | 'created_at' | 'view_count'>,
  ): Promise<QuestionCardRow> {
    const id = randomUUID();

    const { data, error } = await this.supabase
      .from('question_cards')
      .insert({
        id,
        title: qc.title,
        background: qc.background,
        question_body: qc.question_body,
        status: qc.status,
        creator_id: qc.creator_id,
        is_anonymous: qc.is_anonymous,
        tags: qc.tags,
        source_conv_id: qc.source_conv_id,
        source_msg_id: qc.source_msg_id,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create question card: ${error.message}`);
      throw error;
    }

    return data as unknown as QuestionCardRow;
  }

  async findById(id: string): Promise<QuestionCardRow | null> {
    const { data, error } = await this.supabase
      .from('question_cards')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as unknown as QuestionCardRow;
  }

  async findAll(query: QCListQuery): Promise<QCListResult> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    let qb = this.supabase
      .from('question_cards')
      .select(
        'id, title, background, question_body, status, creator_id, is_anonymous, tags, source_conv_id, source_msg_id, view_count, created_at',
        { count: 'exact' },
      );

    if (query.status) {
      qb = qb.eq('status', query.status);
    }

    if (query.tags && query.tags.length > 0) {
      qb = qb.overlaps('tags', query.tags);
    }

    if (query.search) {
      qb = qb.or(
        `title.ilike.%${query.search}%,background.ilike.%${query.search}%,question_body.ilike.%${query.search}%`,
      );
    }

    qb = qb.order('created_at', { ascending: false });
    qb = qb.range(offset, offset + limit - 1);

    const { data, error, count } = await qb;

    if (error) {
      this.logger.error(`Failed to list question cards: ${error.message}`);
      throw error;
    }

    return {
      items: (data ?? []) as unknown as QuestionCardRow[],
      total: count ?? 0,
    };
  }

  async update(
    id: string,
    data: Partial<Pick<QuestionCardRow, 'title' | 'background' | 'question_body' | 'status' | 'tags'>>,
  ): Promise<QuestionCardRow> {
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.background !== undefined) updateData.background = data.background;
    if (data.question_body !== undefined) updateData.question_body = data.question_body;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tags !== undefined) updateData.tags = data.tags;

    const { data: updated, error } = await this.supabase
      .from('question_cards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update question card: ${error.message}`);
      throw error;
    }

    return updated as unknown as QuestionCardRow;
  }

  async incrementViewCount(id: string): Promise<void> {
    // view_count + 1 をRPCまたはフォールバック更新
    const { error } = await this.supabase.rpc('increment_qc_view_count', {
      row_id: id,
    });

    if (!error) return;

    this.logger.warn(
      `RPC increment_qc_view_count failed for ${id}: ${error.message}`,
    );

    // RPCが存在しない場合のフォールバック（非原子的な更新）
    const { data: currentRow, error: selectError } = await this.supabase
      .from('question_cards')
      .select('view_count')
      .eq('id', id)
      .single();

    if (selectError) {
      this.logger.warn(
        `Failed to read view_count for ${id}: ${selectError.message}`,
      );
      return;
    }

    const currentViewCount =
      typeof (currentRow as { view_count?: unknown })?.view_count === 'number'
        ? (currentRow as { view_count: number }).view_count
        : 0;

    const { error: updateError } = await this.supabase
      .from('question_cards')
      .update({ view_count: currentViewCount + 1 })
      .eq('id', id);

    if (updateError) {
      this.logger.warn(
        `Failed to increment view_count for ${id}: ${updateError.message}`,
      );
    }
  }
}

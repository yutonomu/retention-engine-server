import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AnswerCardPort,
  AnswerCardRow,
  ACListQuery,
  ACListResult,
} from './answer-card.port';
import type { SupabaseAdminClient } from '../supabase/adminClient';

@Injectable()
export class AnswerCardRepository implements AnswerCardPort {
  private readonly logger = new Logger(AnswerCardRepository.name);

  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
  ) {}

  async create(
    ac: Omit<AnswerCardRow, 'id' | 'created_at' | 'updated_at' | 'view_count'>,
  ): Promise<AnswerCardRow> {
    const id = randomUUID();

    const { data, error } = await this.supabase
      .from('answer_cards')
      .insert({
        id,
        question_card_id: ac.question_card_id,
        content: ac.content,
        original_content: ac.original_content,
        creator_id: ac.creator_id,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create answer card: ${error.message}`);
      throw error;
    }

    return data as unknown as AnswerCardRow;
  }

  async findById(id: string): Promise<AnswerCardRow | null> {
    const { data, error } = await this.supabase
      .from('answer_cards')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as unknown as AnswerCardRow;
  }

  async findByQuestionCardId(questionCardId: string): Promise<AnswerCardRow[]> {
    const { data, error } = await this.supabase
      .from('answer_cards')
      .select()
      .eq('question_card_id', questionCardId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to find answer cards by question: ${error.message}`,
      );
      throw error;
    }

    return (data ?? []) as unknown as AnswerCardRow[];
  }

  async findAll(query: ACListQuery): Promise<ACListResult> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    let qb = this.supabase
      .from('answer_cards')
      .select(
        'id, question_card_id, content, original_content, creator_id, view_count, created_at, updated_at',
        { count: 'exact' },
      );

    if (query.questionCardId) {
      qb = qb.eq('question_card_id', query.questionCardId);
    }

    if (query.creatorId) {
      qb = qb.eq('creator_id', query.creatorId);
    }

    if (query.search) {
      qb = qb.or(`content.ilike.%${query.search}%`);
    }

    qb = qb.order('created_at', { ascending: false });
    qb = qb.range(offset, offset + limit - 1);

    const { data, error, count } = await qb;

    if (error) {
      this.logger.error(`Failed to list answer cards: ${error.message}`);
      throw error;
    }

    return {
      items: (data ?? []) as unknown as AnswerCardRow[],
      total: count ?? 0,
    };
  }

  async update(
    id: string,
    data: Partial<Pick<AnswerCardRow, 'content' | 'original_content'>>,
  ): Promise<AnswerCardRow> {
    const updateData: Record<string, unknown> = {};

    if (data.content !== undefined) updateData.content = data.content;
    if (data.original_content !== undefined)
      updateData.original_content = data.original_content;

    const { data: updated, error } = await this.supabase
      .from('answer_cards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update answer card: ${error.message}`);
      throw error;
    }

    return updated as unknown as AnswerCardRow;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('answer_cards')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete answer card: ${error.message}`);
      throw error;
    }
  }

  async incrementViewCount(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_ac_view_count', {
      row_id: id,
    });

    if (!error) return;

    this.logger.warn(
      `RPC increment_ac_view_count failed for ${id}: ${error.message}`,
    );

    // フォールバック
    const { data: currentRow, error: selectError } = await this.supabase
      .from('answer_cards')
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
      .from('answer_cards')
      .update({ view_count: currentViewCount + 1 })
      .eq('id', id);

    if (updateError) {
      this.logger.warn(
        `Failed to increment view_count for ${id}: ${updateError.message}`,
      );
    }
  }
}

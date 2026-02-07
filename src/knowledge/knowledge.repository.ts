import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  KnowledgePort,
  KCListQuery,
  KCListResult,
} from './knowledge.port';
import type { KnowledgeCard, SimilarKC } from './knowledge.types';
import type { SupabaseAdminClient } from '../supabase/adminClient';

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
const DEFAULT_SIMILAR_LIMIT = 5;

@Injectable()
export class KnowledgeRepository implements KnowledgePort {
  private readonly logger = new Logger(KnowledgeRepository.name);

  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
  ) {}

  async create(
    kc: Omit<
      KnowledgeCard,
      'id' | 'created_at' | 'verified_at' | 'view_count' | 'useful_count'
    >,
  ): Promise<KnowledgeCard> {
    const id = randomUUID();

    // embedding を文字列形式に変換（pgvector用）
    const embeddingStr = kc.embedding ? `[${kc.embedding.join(',')}]` : null;

    const { data, error } = await this.supabase
      .from('knowledge_cards')
      .insert({
        id,
        title: kc.title,
        content: kc.content,
        source_type: kc.source_type,
        status: kc.status,
        creator_id: kc.creator_id,
        verifier_id: kc.verifier_id,
        project_id: kc.project_id,
        tags: kc.tags,
        confidence: kc.confidence,
        question_card_id: kc.question_card_id,
        source_conversation_id: kc.source_conversation_id,
        source_message_range: kc.source_message_range,
        embedding: embeddingStr,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create knowledge card: ${error.message}`);
      throw error;
    }

    return data as unknown as KnowledgeCard;
  }

  async findById(id: string): Promise<KnowledgeCard | null> {
    const { data, error } = await this.supabase
      .from('knowledge_cards')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as unknown as KnowledgeCard;
  }

  async findByQuestionCardId(questionCardId: string): Promise<KnowledgeCard[]> {
    const { data, error } = await this.supabase
      .from('knowledge_cards')
      .select()
      .eq('question_card_id', questionCardId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to find knowledge cards by question: ${error.message}`,
      );
      throw error;
    }

    return (data ?? []) as unknown as KnowledgeCard[];
  }

  async findAll(query: KCListQuery): Promise<KCListResult> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    let qb = this.supabase
      .from('knowledge_cards')
      .select(
        'id, title, content, source_type, status, creator_id, tags, confidence, question_card_id, created_at, view_count, useful_count',
        { count: 'exact' },
      );

    if (query.status) {
      qb = qb.eq('status', query.status);
    }

    if (query.sourceType) {
      qb = qb.eq('source_type', query.sourceType);
    }

    if (query.creatorId) {
      qb = qb.eq('creator_id', query.creatorId);
    }

    if (query.questionCardId) {
      qb = qb.eq('question_card_id', query.questionCardId);
    }

    if (query.tags && query.tags.length > 0) {
      qb = qb.overlaps('tags', query.tags);
    }

    if (query.search) {
      const safe = query.search.replace(/[%_]/g, '\\$&').replace(/[,.()]/g, '');
      qb = qb.or(
        `title.ilike.%${safe}%,content.ilike.%${safe}%`,
      );
    }

    qb = qb.order('created_at', { ascending: false });
    qb = qb.range(offset, offset + limit - 1);

    const { data, error, count } = await qb;

    if (error) {
      this.logger.error(`Failed to list knowledge cards: ${error.message}`);
      throw error;
    }

    return {
      items: (data ?? []) as unknown as KnowledgeCard[],
      total: count ?? 0,
    };
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        KnowledgeCard,
        | 'title'
        | 'content'
        | 'status'
        | 'tags'
        | 'embedding'
        | 'verifier_id'
        | 'verified_at'
      >
    >,
  ): Promise<KnowledgeCard> {
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.verifier_id !== undefined)
      updateData.verifier_id = data.verifier_id;
    if (data.verified_at !== undefined)
      updateData.verified_at = data.verified_at;

    if (data.embedding !== undefined) {
      updateData.embedding = data.embedding
        ? `[${data.embedding.join(',')}]`
        : null;
    }

    const { data: updated, error } = await this.supabase
      .from('knowledge_cards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update knowledge card: ${error.message}`);
      throw error;
    }

    return updated as unknown as KnowledgeCard;
  }

  async searchSimilar(
    embedding: number[],
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
    limit: number = DEFAULT_SIMILAR_LIMIT,
  ): Promise<SimilarKC[]> {
    const embeddingStr = `[${embedding.join(',')}]`;

    const { data, error } = await this.supabase.rpc(
      'search_similar_knowledge_cards',
      {
        query_embedding: embeddingStr,
        similarity_threshold: threshold,
        match_count: limit,
      },
    );

    if (error) {
      this.logger.error(
        `Failed to search similar knowledge cards: ${error.message}`,
      );
      return [];
    }

    return (data ?? []) as SimilarKC[];
  }

  async incrementViewCount(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_kc_view_count', {
      row_id: id,
    });

    if (error) {
      this.logger.warn(
        `Failed to increment view_count for ${id}: ${error.message}`,
      );
    }
  }

  async incrementUsefulCount(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_kc_useful_count', {
      row_id: id,
    });

    if (error) {
      this.logger.warn(
        `Failed to increment useful_count for ${id}: ${error.message}`,
      );
    }
  }
}

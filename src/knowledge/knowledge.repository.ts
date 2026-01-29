import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { KnowledgePort, KnowledgeListQuery, KnowledgeListResult } from './knowledge.port';
import type { ExtractedKnowledge, SimilarKnowledge } from './knowledge.types';
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

  async save(
    knowledge: Omit<ExtractedKnowledge, 'id' | 'created_at'>,
  ): Promise<ExtractedKnowledge> {
    const id = randomUUID();

    // embedding を文字列形式に変換（pgvector用）
    const embeddingStr = knowledge.embedding
      ? `[${knowledge.embedding.join(',')}]`
      : null;

    const { data, error } = await this.supabase
      .from('extracted_knowledge')
      .insert({
        id,
        content: knowledge.content,
        category: knowledge.category,
        tags: knowledge.tags,
        source_conversation_id: knowledge.source_conversation_id,
        source_message_range: knowledge.source_message_range,
        extracted_by: knowledge.extracted_by,
        embedding: embeddingStr,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to save knowledge: ${error.message}`);
      throw error;
    }

    return data as unknown as ExtractedKnowledge;
  }

  async findSimilar(
    embedding: number[],
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
    limit: number = DEFAULT_SIMILAR_LIMIT,
  ): Promise<SimilarKnowledge[]> {
    // pgvector のコサイン類似度検索を使用
    const embeddingStr = `[${embedding.join(',')}]`;

    const { data, error } = await this.supabase.rpc('search_similar_knowledge', {
      query_embedding: embeddingStr,
      similarity_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      this.logger.error(`Failed to search similar knowledge: ${error.message}`);
      // エラー時は空配列を返す（重複チェックをスキップ）
      return [];
    }

    return (data ?? []) as SimilarKnowledge[];
  }

  async findById(id: string): Promise<ExtractedKnowledge | null> {
    const { data, error } = await this.supabase
      .from('extracted_knowledge')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw error;
    }

    return data as unknown as ExtractedKnowledge;
  }

  async findByConversationId(conversationId: string): Promise<ExtractedKnowledge[]> {
    const { data, error } = await this.supabase
      .from('extracted_knowledge')
      .select()
      .eq('source_conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as unknown as ExtractedKnowledge[];
  }

  async update(
    id: string,
    data: { category?: string },
  ): Promise<ExtractedKnowledge> {
    const updateData: Record<string, unknown> = {};
    if (data.category !== undefined) {
      updateData.category = data.category;
    }

    const { data: updated, error } = await this.supabase
      .from('extracted_knowledge')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update knowledge: ${error.message}`);
      throw error;
    }

    return updated as unknown as ExtractedKnowledge;
  }

  async findAll(query: KnowledgeListQuery): Promise<KnowledgeListResult> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    let qb = this.supabase
      .from('extracted_knowledge')
      .select('id, content, category, tags, extracted_by, created_at', { count: 'exact' });

    if (query.category) {
      qb = qb.eq('category', query.category);
    }

    if (query.search) {
      qb = qb.ilike('content', `%${query.search}%`);
    }

    qb = qb.order('created_at', { ascending: false });
    qb = qb.range(offset, offset + limit - 1);

    const { data, error, count } = await qb;

    if (error) {
      this.logger.error(`Failed to list knowledge: ${error.message}`);
      throw error;
    }

    return {
      items: (data ?? []) as unknown as ExtractedKnowledge[],
      total: count ?? 0,
    };
  }
}

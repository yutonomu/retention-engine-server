import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KNOWLEDGE_PORT, type KnowledgePort, type KCListQuery, type KCListResult } from './knowledge.port';
import { TacitKnowledgeExtractorService } from './tacitKnowledgeExtractor.service';
import type { KnowledgeCard, KCCandidate } from './knowledge.types';
import { composeKCContent } from './knowledge.types';
import type { DetectTacitKnowledgeDto } from './dto/detectTacitKnowledge.dto';
import type { SaveKnowledgeCardDto } from './dto/saveKnowledgeCard.dto';

const SIMILARITY_THRESHOLD = 0.85;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(KNOWLEDGE_PORT)
    private readonly knowledgePort: KnowledgePort,
    private readonly extractor: TacitKnowledgeExtractorService,
  ) {}

  /**
   * 暗黙知検出 — TacitKnowledgeExtractor に委譲
   */
  async detectTacitKnowledge(
    dto: DetectTacitKnowledgeDto,
  ): Promise<KCCandidate[]> {
    return this.extractor.detectTacitKnowledge(
      dto.conversationId,
      dto.startIndex,
      dto.range,
    );
  }

  /**
   * KC保存 — candidate → content合成 → embedding再生成 → 重複チェック → 保存
   */
  async saveKnowledgeCard(
    dto: SaveKnowledgeCardDto,
    userId: string,
  ): Promise<KnowledgeCard> {
    const { conversationId, candidate } = dto;

    // content をマークダウン合成
    const content = composeKCContent({
      situation: candidate.situation,
      knowhow: candidate.knowhow,
      precaution: candidate.precaution,
    });

    // 保存用 embedding を最終 content から生成
    const embedding = await this.extractor.generateEmbedding(content);

    // 重複チェック
    if (embedding.length > 0) {
      const similar = await this.knowledgePort.searchSimilar(embedding, SIMILARITY_THRESHOLD, 1);
      if (similar.length > 0) {
        this.logger.warn(
          `Duplicate KC detected (similarity: ${similar[0].similarity}). Saving anyway with warning.`,
        );
        // 重複しても保存はする（ユーザーが明示的に保存を選択したため）
      }
    }

    return this.knowledgePort.create({
      title: candidate.title,
      content,
      source_type: 'expert',
      status: 'draft',
      creator_id: userId,
      verifier_id: null,
      project_id: null,
      tags: candidate.tags,
      confidence: candidate.confidence ?? null,
      source_conversation_id: conversationId,
      source_message_range: candidate.sourceMessageRange
        ? { start_index: candidate.sourceMessageRange.start, end_index: candidate.sourceMessageRange.end }
        : null,
      embedding: embedding.length > 0 ? embedding : null,
    });
  }

  /**
   * KC一覧取得
   */
  async listKnowledgeCards(query: KCListQuery): Promise<KCListResult> {
    return this.knowledgePort.findAll(query);
  }

  /**
   * KC単件取得 + viewCount増加
   */
  async getKnowledgeCard(id: string): Promise<KnowledgeCard> {
    const kc = await this.knowledgePort.findById(id);
    if (!kc) {
      throw new NotFoundException(`Knowledge card ${id} not found`);
    }

    // 非同期でviewCount増加（エラーは無視）
    this.knowledgePort.incrementViewCount(id).catch((err) => {
      this.logger.warn(`Failed to increment view count: ${err.message}`);
    });

    return kc;
  }

  /**
   * KC編集 — content再合成 + embedding再生成
   */
  async updateKnowledgeCard(
    id: string,
    data: {
      title?: string;
      situation?: string;
      knowhow?: string;
      precaution?: string;
      tags?: string[];
      status?: KnowledgeCard['status'];
    },
    userId?: string,
  ): Promise<KnowledgeCard> {
    const existing = await this.knowledgePort.findById(id);
    if (!existing) {
      throw new NotFoundException(`Knowledge card ${id} not found`);
    }

    const updatePayload: Parameters<KnowledgePort['update']>[1] = {};

    if (data.title !== undefined) {
      updatePayload.title = data.title;
    }

    if (data.tags !== undefined) {
      updatePayload.tags = data.tags;
    }

    // situation/knowhow/precaution のいずれかが変わったら content 再合成
    if (data.situation !== undefined || data.knowhow !== undefined || data.precaution !== undefined) {
      // 既存のcontentからセクションを抽出
      const sections = this.parseKCContent(existing.content);
      const newContent = composeKCContent({
        situation: data.situation ?? sections.situation,
        knowhow: data.knowhow ?? sections.knowhow,
        precaution: data.precaution ?? sections.precaution,
      });
      updatePayload.content = newContent;

      // embedding 再生成
      const embedding = await this.extractor.generateEmbedding(newContent);
      if (embedding.length > 0) {
        updatePayload.embedding = embedding;
      }
    }

    // status 変更
    if (data.status !== undefined) {
      updatePayload.status = data.status;
      if (data.status === 'verified' && userId) {
        updatePayload.verifier_id = userId;
        updatePayload.verified_at = new Date().toISOString();
      }
    }

    return this.knowledgePort.update(id, updatePayload);
  }

  /**
   * 役立ったカウント増加
   */
  async markUseful(id: string): Promise<void> {
    const kc = await this.knowledgePort.findById(id);
    if (!kc) {
      throw new NotFoundException(`Knowledge card ${id} not found`);
    }
    await this.knowledgePort.incrementUsefulCount(id);
  }

  /**
   * KC content からセクションを抽出
   */
  private parseKCContent(content: string): {
    situation: string;
    knowhow: string;
    precaution: string;
  } {
    const situationMatch = content.match(/## 状況\n([\s\S]*?)(?=\n## |$)/);
    const knowhowMatch = content.match(/## ノウハウ\n([\s\S]*?)(?=\n## |$)/);
    const precautionMatch = content.match(/## 注意点\n([\s\S]*?)(?=\n## |$)/);

    return {
      situation: situationMatch?.[1]?.trim() ?? '',
      knowhow: knowhowMatch?.[1]?.trim() ?? '',
      precaution: precautionMatch?.[1]?.trim() ?? '',
    };
  }
}

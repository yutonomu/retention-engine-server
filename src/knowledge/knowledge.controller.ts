import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import type { DetectTacitKnowledgeRequest } from './dto/detectTacitKnowledge.dto';
import type { SaveKnowledgeCardRequest } from './dto/saveKnowledgeCard.dto';
import type { KnowledgeCardQueryDto } from './dto/knowledgeCardQuery.dto';
import type {
  DetectTacitKnowledgeResponse,
  SaveKnowledgeCardResponse,
  KCListItemResponse,
  KCDetailResponse,
  TriggerStatusResponse,
  DetectTacitWithTriggersResponse,
} from './dto/knowledgeCardResponse.dto';

interface AuthenticatedRequest {
  user: { sub: string };
}

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /**
   * POST /knowledge/detect-tacit
   * 暗黙知を検出（プレビュー）
   */
  @Post('detect-tacit')
  async detectTacitKnowledge(
    @Body() body: DetectTacitKnowledgeRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<DetectTacitKnowledgeResponse> {
    const candidates = await this.knowledgeService.detectTacitKnowledge({
      conversationId: body.conversationId,
      startIndex: body.startIndex,
      range: body.range,
    });

    return { candidates };
  }

  /**
   * GET /knowledge/trigger-status/:conversationId
   * Story 2-6: トリガー蓄積状況を確認
   */
  @Get('trigger-status/:conversationId')
  async getTriggerStatus(
    @Param('conversationId') conversationId: string,
  ): Promise<TriggerStatusResponse> {
    return this.knowledgeService.checkTriggerThreshold(conversationId);
  }

  /**
   * POST /knowledge/detect-tacit-with-triggers
   * Story 2-6: トリガーコンテキスト付きで暗黙知検出
   */
  @Post('detect-tacit-with-triggers')
  async detectTacitKnowledgeWithTriggers(
    @Body() body: { conversationId: string },
  ): Promise<DetectTacitWithTriggersResponse> {
    return this.knowledgeService.detectTacitKnowledgeWithTriggerContext(
      body.conversationId,
    );
  }

  /**
   * POST /knowledge/cards
   * KC保存
   */
  @Post('cards')
  async saveKnowledgeCard(
    @Body() body: SaveKnowledgeCardRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<SaveKnowledgeCardResponse> {
    const card = await this.knowledgeService.saveKnowledgeCard(
      {
        conversationId: body.conversationId,
        questionCardId: body.questionCardId,
        candidate: body.candidate,
      },
      req.user.sub,
    );

    return {
      id: card.id,
      title: card.title,
      status: card.status,
      createdAt: card.created_at,
    };
  }

  /**
   * GET /knowledge/cards
   * KC一覧
   */
  @Get('cards')
  async listKnowledgeCards(
    @Query() query: KnowledgeCardQueryDto,
  ): Promise<{ items: KCListItemResponse[]; total: number }> {
    const result = await this.knowledgeService.listKnowledgeCards({
      status: query.status,
      sourceType: query.sourceType,
      questionCardId: query.questionCardId,
      search: query.search,
      tags: query.tags ? query.tags.split(',') : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });

    return {
      items: result.items.map((kc) => ({
        id: kc.id,
        title: kc.title,
        content: kc.content,
        sourceType: kc.source_type,
        status: kc.status,
        tags: kc.tags,
        confidence: kc.confidence,
        questionCardId: kc.question_card_id,
        createdAt: kc.created_at,
        viewCount: kc.view_count,
        usefulCount: kc.useful_count,
      })),
      total: result.total,
    };
  }

  /**
   * GET /knowledge/cards/:id
   * KC詳細
   */
  /**
   * GET /knowledge/cards/question/:questionCardId
   * 質問カードに紐づくKC一覧
   */
  @Get('cards/question/:questionCardId')
  async listByQuestionCard(
    @Param('questionCardId') questionCardId: string,
  ): Promise<{ items: KCListItemResponse[]; total: number }> {
    const result = await this.knowledgeService.listKnowledgeCards({
      questionCardId,
    });

    return {
      items: result.items.map((kc) => ({
        id: kc.id,
        title: kc.title,
        content: kc.content,
        sourceType: kc.source_type,
        status: kc.status,
        tags: kc.tags,
        confidence: kc.confidence,
        questionCardId: kc.question_card_id,
        createdAt: kc.created_at,
        viewCount: kc.view_count,
        usefulCount: kc.useful_count,
      })),
      total: result.total,
    };
  }

  /**
   * GET /knowledge/cards/:id
   * KC詳細
   */
  @Get('cards/:id')
  async getKnowledgeCard(@Param('id') id: string): Promise<KCDetailResponse> {
    const kc = await this.knowledgeService.getKnowledgeCard(id);

    return {
      id: kc.id,
      title: kc.title,
      content: kc.content,
      sourceType: kc.source_type,
      status: kc.status,
      creatorId: kc.creator_id,
      verifierId: kc.verifier_id,
      tags: kc.tags,
      confidence: kc.confidence,
      questionCardId: kc.question_card_id,
      sourceConversationId: kc.source_conversation_id,
      sourceMessageRange: kc.source_message_range,
      createdAt: kc.created_at,
      verifiedAt: kc.verified_at,
      viewCount: kc.view_count,
      usefulCount: kc.useful_count,
    };
  }

  /**
   * PATCH /knowledge/cards/:id
   * KC編集
   */
  @Patch('cards/:id')
  async updateKnowledgeCard(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      situation?: string;
      knowhow?: string;
      precaution?: string;
      tags?: string[];
      status?: string;
    },
    @Req() req: AuthenticatedRequest,
  ): Promise<KCDetailResponse> {
    const kc = await this.knowledgeService.updateKnowledgeCard(
      id,
      {
        title: body.title,
        situation: body.situation,
        knowhow: body.knowhow,
        precaution: body.precaution,
        tags: body.tags,
        status: body.status as 'draft' | 'verified' | 'official' | undefined,
      },
      req.user.sub,
    );

    return {
      id: kc.id,
      title: kc.title,
      content: kc.content,
      sourceType: kc.source_type,
      status: kc.status,
      creatorId: kc.creator_id,
      verifierId: kc.verifier_id,
      tags: kc.tags,
      confidence: kc.confidence,
      questionCardId: kc.question_card_id,
      sourceConversationId: kc.source_conversation_id,
      sourceMessageRange: kc.source_message_range,
      createdAt: kc.created_at,
      verifiedAt: kc.verified_at,
      viewCount: kc.view_count,
      usefulCount: kc.useful_count,
    };
  }

  /**
   * POST /knowledge/cards/:id/useful
   * 役立ったカウント
   */
  @Post('cards/:id/useful')
  async markUseful(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.knowledgeService.markUseful(id);
    return { success: true };
  }
}

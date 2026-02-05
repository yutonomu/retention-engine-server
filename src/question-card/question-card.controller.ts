import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuestionCardService } from './question-card.service';
import type { CreateQuestionCardsRequest, GenerateQuestionCardsRequest } from './dto/create-question-card.dto';
import type {
  ListQuestionCardsQuery,
  QuestionCardListItem,
  QuestionCardDetailResponse,
} from './dto/list-question-cards.dto';

interface AuthenticatedRequest {
  user: { sub: string };
}

@Controller('question-cards')
@UseGuards(JwtAuthGuard)
export class QuestionCardController {
  constructor(private readonly service: QuestionCardService) {}

  /**
   * POST /question-cards/generate/stream
   * AIとの対話で質問カードを生成（SSEストリーミング）
   */
  @Post('generate/stream')
  async generateStream(
    @Body() body: GenerateQuestionCardsRequest,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.service.generateStream(body)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const errorEvent = {
        type: 'error',
        data: error instanceof Error ? error.message : 'Unknown error',
      };
      res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } finally {
      res.end();
    }
  }

  /**
   * POST /question-cards/generate
   * AIとの対話で質問カードを生成（非ストリーミング）
   */
  @Post('generate')
  async generate(
    @Body() body: GenerateQuestionCardsRequest,
  ) {
    return this.service.generateResponse(body);
  }

  /**
   * POST /question-cards
   * 質問カードを保存（複数一括）
   */
  @Post()
  async saveQuestionCards(
    @Body() body: CreateQuestionCardsRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const cards = await this.service.saveQuestionCards(body, req.user.sub);

    return {
      saved: cards.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.created_at,
      })),
    };
  }

  /**
   * GET /question-cards
   * 質問カード一覧
   */
  @Get()
  async listQuestionCards(
    @Query() query: ListQuestionCardsQuery,
  ): Promise<{ items: QuestionCardListItem[]; total: number }> {
    const result = await this.service.listQuestionCards({
      status: query.status as 'open' | 'resolved' | undefined,
      search: query.search,
      tags: query.tags ? query.tags.split(',') : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });

    const creatorIds = result.items.map((qc) => qc.creator_id);
    const names = await this.service.resolveCreatorNames(creatorIds);

    return {
      items: result.items.map((qc) => ({
        id: qc.id,
        title: qc.title,
        background: qc.background,
        questionBody: qc.question_body,
        status: qc.status,
        creatorId: qc.creator_id,
        creatorName: qc.is_anonymous ? null : (names[qc.creator_id] ?? qc.creator_id),
        isAnonymous: qc.is_anonymous,
        tags: qc.tags,
        viewCount: qc.view_count,
        createdAt: qc.created_at,
      })),
      total: result.total,
    };
  }

  /**
   * GET /question-cards/:id
   * 質問カード詳細
   */
  @Get(':id')
  async getQuestionCard(
    @Param('id') id: string,
  ): Promise<QuestionCardDetailResponse> {
    const qc = await this.service.getQuestionCard(id);
    const names = await this.service.resolveCreatorNames([qc.creator_id]);

    return {
      id: qc.id,
      title: qc.title,
      background: qc.background,
      questionBody: qc.question_body,
      status: qc.status,
      creatorId: qc.creator_id,
      creatorName: qc.is_anonymous ? null : (names[qc.creator_id] ?? qc.creator_id),
      isAnonymous: qc.is_anonymous,
      tags: qc.tags,
      sourceConvId: qc.source_conv_id,
      sourceMsgId: qc.source_msg_id,
      viewCount: qc.view_count,
      createdAt: qc.created_at,
    };
  }

  /**
   * PATCH /question-cards/:id
   * 質問カード更新
   */
  @Patch(':id')
  async updateQuestionCard(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      background?: string;
      questionBody?: string;
      status?: string;
      tags?: string[];
    },
  ): Promise<QuestionCardDetailResponse> {
    const qc = await this.service.updateQuestionCard(id, {
      title: body.title,
      background: body.background,
      question_body: body.questionBody,
      status: body.status as 'open' | 'resolved' | undefined,
      tags: body.tags,
    });
    const names = await this.service.resolveCreatorNames([qc.creator_id]);

    return {
      id: qc.id,
      title: qc.title,
      background: qc.background,
      questionBody: qc.question_body,
      status: qc.status,
      creatorId: qc.creator_id,
      creatorName: qc.is_anonymous ? null : (names[qc.creator_id] ?? qc.creator_id),
      isAnonymous: qc.is_anonymous,
      tags: qc.tags,
      sourceConvId: qc.source_conv_id,
      sourceMsgId: qc.source_msg_id,
      viewCount: qc.view_count,
      createdAt: qc.created_at,
    };
  }
}

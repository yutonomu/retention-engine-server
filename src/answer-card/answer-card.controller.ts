import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnswerCardService } from './answer-card.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type {
  GenerateAnswerRequest,
  CreateAnswerCardRequest,
} from './dto/create-answer-card.dto';
import type { ListAnswerCardsQuery } from './dto/list-answer-cards.dto';
import { KnowledgeService } from '../knowledge/knowledge.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string };
}

@Controller('answer-cards')
@UseGuards(JwtAuthGuard)
export class AnswerCardController {
  constructor(
    private readonly answerCardService: AnswerCardService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  /**
   * AI対話による回答作成（ストリーミング）
   * POST /answer-cards/generate/stream
   */
  @Post('generate/stream')
  async generateStream(
    @Body() dto: GenerateAnswerRequest,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    for await (const event of this.answerCardService.generateStream(dto)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.end();
  }

  /**
   * AI対話による回答作成（非ストリーミング）
   * POST /answer-cards/generate
   */
  @Post('generate')
  async generate(@Body() dto: GenerateAnswerRequest) {
    return this.answerCardService.generateResponse(dto);
  }

  /**
   * 回答カード保存（KnowledgeCardとして保存）
   * POST /answer-cards
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAnswerCardRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const kc = await this.answerCardService.saveAsKnowledgeCard(
      dto,
      req.user.sub,
    );

    return {
      id: kc.id,
      title: kc.title,
      status: kc.status,
      createdAt: kc.created_at,
    };
  }

  /**
   * 回答カード一覧取得（旧データ閲覧用）
   * GET /answer-cards
   */
  @Get()
  async list(@Query() query: ListAnswerCardsQuery) {
    const result = await this.answerCardService.listAnswerCards({
      questionCardId: query.questionCardId,
      creatorId: query.creatorId,
      search: query.search,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });

    // creator_idからdisplayNameを解決
    const creatorIds = result.items.map((item) => item.creator_id);
    const creatorNames =
      await this.answerCardService.resolveCreatorNames(creatorIds);

    return {
      items: result.items.map((item) => ({
        id: item.id,
        questionCardId: item.question_card_id,
        content: item.content,
        originalContent: item.original_content,
        creatorId: item.creator_id,
        creatorName: creatorNames[item.creator_id] ?? item.creator_id,
        viewCount: item.view_count,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      total: result.total,
    };
  }

  /**
   * 質問カードに対する回答一覧取得（KC形式）
   * GET /answer-cards/question/:questionCardId
   */
  @Get('question/:questionCardId')
  async listByQuestion(@Param('questionCardId') questionCardId: string) {
    // KC側から取得
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
        creatorId: kc.creator_id,
        createdAt: kc.created_at,
        viewCount: kc.view_count,
        usefulCount: kc.useful_count,
      })),
      total: result.total,
    };
  }

  /**
   * 回答カード詳細取得
   * GET /answer-cards/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const item = await this.answerCardService.getAnswerCard(id);

    const creatorNames = await this.answerCardService.resolveCreatorNames([
      item.creator_id,
    ]);

    return {
      id: item.id,
      questionCardId: item.question_card_id,
      content: item.content,
      originalContent: item.original_content,
      creatorId: item.creator_id,
      creatorName: creatorNames[item.creator_id] ?? item.creator_id,
      viewCount: item.view_count,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  /**
   * 回答カード更新
   * PATCH /answer-cards/:id
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<Pick<CreateAnswerCardRequest, 'candidate'>>,
  ) {
    const updated = await this.answerCardService.updateAnswerCard(id, {
      content: dto.candidate ? undefined : undefined,
    });

    return {
      id: updated.id,
      questionCardId: updated.question_card_id,
      content: updated.content,
      originalContent: updated.original_content,
      creatorId: updated.creator_id,
      viewCount: updated.view_count,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * 回答カード削除
   * DELETE /answer-cards/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.answerCardService.deleteAnswerCard(id);
  }
}

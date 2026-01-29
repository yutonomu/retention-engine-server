import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import type { ExtractKnowledgeDto } from './dto/extractKnowledge.dto';
import type { SaveKnowledgeDto } from './dto/saveKnowledge.dto';
import type { UpdateKnowledgeDto } from './dto/updateKnowledge.dto';
import type { ExtractKnowledgePreviewResponse, SaveKnowledgeResponse } from './dto/knowledgeResponse.dto';
import type { KnowledgeListResult } from './knowledge.port';

interface AuthenticatedRequest {
  user: {
    sub: string; // userId
    role?: string;
  };
}

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /**
   * POST /knowledge/extract
   * チャット履歴から暗黙知を抽出（プレビューのみ、保存しない）
   */
  @Post('extract')
  async extractKnowledge(
    @Body() body: ExtractKnowledgeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExtractKnowledgePreviewResponse> {
    if (!body.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const userId = req.user.sub;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    return this.knowledgeService.extractKnowledgePreview({
      conversationId: body.conversationId,
      range: body.range ?? 'all',
      userId,
    });
  }

  /**
   * POST /knowledge/save
   * ユーザーが選択した候補を保存
   */
  @Post('save')
  async saveKnowledge(
    @Body() body: SaveKnowledgeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SaveKnowledgeResponse> {
    if (!body.conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    if (!body.items || body.items.length === 0) {
      throw new BadRequestException('items must contain at least one item');
    }

    const userId = req.user.sub;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    return this.knowledgeService.saveKnowledgeItems({
      conversationId: body.conversationId,
      items: body.items,
      userId,
    });
  }

  /**
   * PATCH /knowledge/:id
   * ナレッジのカテゴリを更新
   */
  @Patch(':id')
  async updateKnowledge(
    @Param('id') id: string,
    @Body() body: UpdateKnowledgeDto,
  ): Promise<{ id: string; category: string }> {
    if (!body.category) {
      throw new BadRequestException('category is required');
    }
    return this.knowledgeService.updateKnowledge(id, { category: body.category });
  }

  /**
   * GET /knowledge
   * 抽出済みナレッジ一覧を取得（フィルタ・ページネーション対応）
   */
  @Get()
  async listKnowledge(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<KnowledgeListResult> {
    return this.knowledgeService.listKnowledge({
      category: category || undefined,
      search: search || undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }
}

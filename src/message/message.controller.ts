import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessageService } from './message.service';
import type { Message, TriggerType } from './message.types';
import type { TriggerAggregation } from './message.port';

interface MessageListResponse {
  data: Message[];
}

interface PaginatedMessageResponse {
  data: Message[];
  hasMore: boolean;
  nextCursor?: string;
}

interface CreateMessageRequest {
  convId: string;
  role: Message['role'];
  content: string;
  // Story 2-6: トリガーメタデータ
  triggerType?: TriggerType | null;
  triggerConfidence?: number | null;
  triggerExcerpt?: string | null;
}

interface CreateMessageResponse {
  data: Message;
}

interface TriggerAggregationResponse {
  data: TriggerAggregation[];
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  async getMessages(
    @Query('convId') convId?: string,
  ): Promise<MessageListResponse> {
    const items = await this.messageService.getMessagesByConversation(
      convId ?? '',
    );
    return { data: items };
  }

  @Get('paginated')
  async getMessagesPaginated(
    @Query('convId') convId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ): Promise<PaginatedMessageResponse> {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const result = await this.messageService.getMessagesByConversationPaginated(
      convId ?? '',
      { cursor, limit },
    );
    return {
      data: result.items,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  @Get('mentor')
  async getMessagesForMentor(
    @Query('mentorId') mentorId?: string,
    @Query('convId') convId?: string,
  ): Promise<MessageListResponse> {
    const items = await this.messageService.getMessagesForMentor(
      mentorId ?? '',
      convId ?? '',
    );
    return { data: items };
  }

  @Post()
  async createMessage(
    @Body() body: CreateMessageRequest,
  ): Promise<CreateMessageResponse> {
    const message = await this.messageService.createMessage({
      convId: body.convId,
      role: body.role,
      content: body.content,
      triggerType: body.triggerType ?? null,
      triggerConfidence: body.triggerConfidence ?? null,
      triggerExcerpt: body.triggerExcerpt ?? null,
    });
    return { data: message };
  }

  /**
   * 会話内のトリガー集計 (Story 2-6)
   * KC生成判断のためのトリガー集計
   */
  @Get('triggers')
  async getTriggerAggregation(
    @Query('convId') convId?: string,
  ): Promise<TriggerAggregationResponse> {
    const aggregation =
      await this.messageService.aggregateTriggersByConversation(convId ?? '');
    return { data: aggregation };
  }
}

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessageService } from './message.service';
import type { Message } from './message.types';

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
}

interface CreateMessageResponse {
  data: Message;
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) { }

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
    });
    return { data: message };
  }
}

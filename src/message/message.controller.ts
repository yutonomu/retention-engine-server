import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MessageService } from './message.service';
import type { Message } from './message.types';

interface MessageListResponse {
  data: Message[];
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
export class MessageController {
  // TODO: 認証ガード(@UseGuards(JwtAuthGuard))が未実装です。
  // 会話内容の漏洩を防ぐため、早急に認証を追加してください。
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

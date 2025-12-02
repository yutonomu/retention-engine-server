import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import type {
  GetActiveConversationListForMentorReturn,
  GetConversationListByNewHireReturn,
} from './conversation.types';

@Controller('conversations')
export class ConversationController {
  // TODO: 認証ガード(@UseGuards(JwtAuthGuard))が未実装です。
  // 早急に認証を追加し、userIdやmentorIdをリクエストボディ/クエリではなく、
  // req.userから取得するように修正する必要があります。
  constructor(private readonly conversationService: ConversationService) { }

  @Get('mentor')
  async getMentorConversationList(
    @Query('mentorId') mentorId?: string,
  ): Promise<GetActiveConversationListForMentorReturn[]> {
    if (!mentorId) {
      throw new BadRequestException('mentorId is required');
    }
    return this.conversationService.getActiveConversationListForMentor(
      mentorId,
    );
  }

  @Get('newHire')
  async getConversationListByNewHire(
    @Query('userId') userId?: string,
  ): Promise<GetConversationListByNewHireReturn[]> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.conversationService.getConversationListByNewHire(userId);
  }

  @Post('newHire')
  async createConversationForNewHire(
    @Body()
    body: {
      userId?: string;
      title?: string;
      role?: string;
      displayName?: string;
      email?: string;
    },
  ): Promise<GetConversationListByNewHireReturn> {
    const userId = body.userId ?? '';
    const title = body.title ?? '';
    return this.conversationService.createConversationForNewHire(
      userId,
      title,
      body.role,
      body.displayName,
      body.email,
    );
  }
}

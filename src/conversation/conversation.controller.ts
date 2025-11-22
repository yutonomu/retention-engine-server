import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import type {
  GetActiveConversationListForMentorReturn,
  GetConversationListByNewHireReturn,
} from './conversation.types';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get('mentor')
  getMentorConversationList(
    @Query('mentorId') mentorId?: string,
  ): GetActiveConversationListForMentorReturn[] {
    if (!mentorId) {
      throw new BadRequestException('mentorId is required');
    }
    return this.conversationService.getActiveConversationListForMentor(
      mentorId,
    );
  }

  @Get('newHire')
  getConversationListByNewHire(
    @Query('userId') userId?: string,
  ): GetConversationListByNewHireReturn[] {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.conversationService.getConversationListByNewHire(userId);
  }

  @Post('newHire')
  createConversationForNewHire(
    @Body() body: { userId?: string; title?: string },
  ): GetConversationListByNewHireReturn {
    const userId = body.userId ?? '';
    const title = body.title ?? '';
    return this.conversationService.createConversationForNewHire(
      userId,
      title,
    );
  }
}

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
  constructor(private readonly conversationService: ConversationService) {}

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
    @Body() body: { userId?: string; title?: string },
  ): Promise<GetConversationListByNewHireReturn> {
    const userId = body.userId ?? '';
    const title = body.title ?? '';
    return this.conversationService.createConversationForNewHire(
      userId,
      title,
    );
  }
}

import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import {
  GetActiveConversationListForMentorReturn,
  GetConversationListByNewHireReturn,
} from './conversation.types';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get('mentor')
  getMentorConversationList(): GetActiveConversationListForMentorReturn[] {
    return this.conversationService.getActiveConversationListForMentor();
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
}

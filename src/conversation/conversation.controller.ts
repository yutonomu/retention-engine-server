import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { Conversation } from './conversation.types';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get('mentor')
  getAllConversationList(): Conversation[] {
    return this.conversationService.getAllConversationList();
  }

  @Get('newHire')
  getConversationListByNewHire(
    @Query('userId') userId?: string,
  ): Conversation[] {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.conversationService.getConversationList(userId);
  }
}

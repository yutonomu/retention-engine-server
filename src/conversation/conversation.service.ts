import { Injectable } from '@nestjs/common';
import {
  Conversation,
  GetActiveConversationListForMentorReturn,
  GetConversationListByNewHireReturn,
} from './conversation.types';
import { ConversationRepository } from './repositories/conversation.repository';
import { UserService } from '../user/user.service';

@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly userService: UserService,
  ) {}

  getConversationListByNewHire(userId: string): GetConversationListByNewHireReturn[] {
    const conversations = this.conversationRepository.findByOwner(userId);

    return conversations.map((conversation) => {
      const response: GetConversationListByNewHireReturn = {
        conv_id: conversation.conv_id,
        title: conversation.title,
        created_at: conversation.created_at,
      };

      return response;
    });
  }

  getActiveConversationListForMentor(): GetActiveConversationListForMentorReturn[] {
    const activeConversations = this.conversationRepository.findByState(
      'active',
    );

    return activeConversations.map((conversation) => {
      const ownerName = this.userService.findUserNameById(
        conversation.owner_id,
      );

      const response: GetActiveConversationListForMentorReturn = {
        conv_id: conversation.conv_id,
        title: conversation.title,
        created_at: conversation.created_at,
        owner_name: ownerName ?? 'Unknown user',
      };

      return response;
    });
  }
}

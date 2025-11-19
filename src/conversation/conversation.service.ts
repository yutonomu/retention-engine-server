import { Injectable } from '@nestjs/common';
import { Conversation } from './conversation.types';
import { conversationData } from './data/conversation.data';

@Injectable()
export class ConversationService {
  private readonly conversations = conversationData;

  getConversationList(userId: string): Conversation[] {
    return this.conversations.filter(
      (conversation) => conversation.ownerId === userId,
    );
  }
}

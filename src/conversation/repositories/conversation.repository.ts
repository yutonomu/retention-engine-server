import { Injectable } from '@nestjs/common';
import { Conversation } from '../conversation.types';
import { conversationData } from '../data/conversation.data';

@Injectable()
export class ConversationRepository {
  private readonly conversations: Conversation[] = conversationData;

  findAll(): Conversation[] {
    return this.conversations;
  }

  findByOwner(ownerId: string): Conversation[] {
    return this.conversations.filter(
      (conversation) => conversation.ownerId === ownerId,
    );
  }
}

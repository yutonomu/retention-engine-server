import { Injectable } from '@nestjs/common';
import { Conversation, ConversationState } from '../conversation.types';
import { conversationData } from '../data/conversation.data';

@Injectable()
export class ConversationRepository {
  private readonly conversations: Conversation[] = conversationData;

  findAll(): Conversation[] {
    return this.conversations;
  }

  findByOwner(ownerId: string): Conversation[] {
    return this.conversations.filter(
      (conversation) => conversation.owner_id === ownerId,
    );
  }

  findByState(state: ConversationState): Conversation[] {
    return this.conversations.filter(
      (conversation) => conversation.state === state,
    );
  }
}

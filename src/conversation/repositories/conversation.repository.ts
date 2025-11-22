import { Injectable, NotFoundException } from '@nestjs/common';
import { Conversation, ConversationState } from '../conversation.types';
import { conversationData } from '../data/conversation.data';

@Injectable()
export class ConversationRepository {
  private readonly conversations: Conversation[] = conversationData;

  create(ownerId: string, title: string): Conversation {
    const now = new Date();
    const conv: Conversation = {
      conv_id: `conv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      owner_id: ownerId,
      title,
      state: 'active',
      created_at: now,
    };
    this.conversations.push(conv);
    return conv;
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

  findById(convId: string): Conversation {
    const found = this.conversations.find(
      (conversation) => conversation.conv_id === convId,
    );
    if (!found) {
      throw new NotFoundException(`Conversation ${convId} not found.`);
    }
    return found;
  }

  findActiveByOwners(ownerIds: string[]): Conversation[] {
    if (!ownerIds.length) {
      return [];
    }
    const ownerSet = new Set(ownerIds);
    return this.conversations.filter(
      (conversation) =>
        ownerSet.has(conversation.owner_id) &&
        conversation.state === 'active',
    );
  }
}

import { Injectable } from '@nestjs/common';
import { Conversation } from './conversation.types';
import { ConversationRepository } from './repositories/conversation.repository';

@Injectable()
export class ConversationService {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  getConversationList(userId: string): Conversation[] {
    return this.conversationRepository.findByOwner(userId);
  }

  getAllConversationList(): Conversation[] {
    return this.conversationRepository.findAll();
  }
}

import { Injectable } from '@nestjs/common';
import type { UUID } from '../../common/uuid';
import type { MessageDataAccessInterface } from './MessageDataAccessInterface.types';
import type { Message } from '../../Entity/Message';
import { conversationHistoryData } from '../data/conversation-history.data';

@Injectable()
export class ConversationHistoryRepository
  implements MessageDataAccessInterface
{
  fetchMessages(conversationId: UUID): Promise<Message[]> {
    return Promise.resolve(conversationHistoryData[conversationId] ?? []);
  }

  saveMessages(conversationId: UUID, messages: Message[]): Promise<void> {
    const existing = conversationHistoryData[conversationId] ?? [];
    conversationHistoryData[conversationId] = [...existing, ...messages];
    return Promise.resolve();
  }
}

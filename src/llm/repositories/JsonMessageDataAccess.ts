import { Injectable } from '@nestjs/common';
import type { UUID } from '../../common/uuid';
import type { MessageDataAccessInterface } from './MessageDataAccessInterface.types';
import type { Message } from '../../Entity/Message';
import { JsonMessage } from '../data/JsonMessage';

@Injectable()
export class JsonMessageDataAccess implements MessageDataAccessInterface {
  fetchMessages(conversationId: UUID): Promise<Message[]> {
    return Promise.resolve(JsonMessage[conversationId] ?? []);
  }

  saveMessages(conversationId: UUID, messages: Message[]): Promise<void> {
    const existing = JsonMessage[conversationId] ?? [];
    JsonMessage[conversationId] = [...existing, ...messages];
    return Promise.resolve();
  }
}

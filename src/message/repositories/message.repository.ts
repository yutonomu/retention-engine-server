import { Injectable, NotFoundException } from '@nestjs/common';
import { messageData } from '../data/message.data';
import type { Message } from '../message.types';
import { createUUID } from '../../common/uuid';

@Injectable()
export class MessageRepository {
  private readonly store: Message[] = [...messageData];

  findById(messageId: string): Message {
    const found = this.store.find((message) => message.msg_id === messageId);
    if (!found) {
      throw new NotFoundException(`Message ${messageId} not found.`);
    }
    return found;
  }

  findAllByConversation(convId: string): Message[] {
    return this.store
      .filter((message) => message.conv_id === convId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
  }): Message {
    const message: Message = {
      msg_id: createUUID(),
      conv_id: input.convId,
      role: input.role,
      content: input.content,
      created_at: new Date(),
    };
    this.store.push(message);
    return message;
  }
}

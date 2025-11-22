import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageRepository } from './repositories/message.repository';
import { ConversationRepository } from '../conversation/repositories/conversation.repository';
import type { Message } from './message.types';

@Injectable()
export class MessageService {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  getMessagesByConversation(convId: string): Message[] {
    if (!convId?.trim()) {
      throw new BadRequestException('convId is required');
    }
    this.conversationRepository.findById(convId);
    return this.messageRepository.findAllByConversation(convId);
  }

  createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
  }): Message {
    if (!input.convId?.trim()) {
      throw new BadRequestException('convId is required');
    }
    if (!input.role?.trim()) {
      throw new BadRequestException('role is required');
    }
    const trimmedContent = input.content?.trim();
    if (!trimmedContent) {
      throw new BadRequestException('content must not be empty');
    }
    this.conversationRepository.findById(input.convId);
    return this.messageRepository.createMessage({
      convId: input.convId,
      role: input.role,
      content: trimmedContent,
    });
  }
}

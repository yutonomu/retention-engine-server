import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { MessagePort } from './message.port';
import { MESSAGE_PORT } from './message.port';
import type { ConversationPort } from '../conversation/conversation.port';
import { CONVERSATION_PORT } from '../conversation/conversation.port';
import type { Message } from './message.types';

@Injectable()
export class MessageService {
  constructor(
    @Inject(MESSAGE_PORT)
    private readonly messageRepository: MessagePort,
    @Inject(CONVERSATION_PORT)
    private readonly conversationRepository: ConversationPort,
  ) {}

  async getMessagesByConversation(convId: string): Promise<Message[]> {
    if (!convId?.trim()) {
      throw new BadRequestException('convId is required');
    }
    await this.conversationRepository.findById(convId);
    return this.messageRepository.findAllByConversation(convId);
  }

  async createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
  }): Promise<Message> {
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
    await this.conversationRepository.findById(input.convId);
    return this.messageRepository.createMessage({
      convId: input.convId,
      role: input.role,
      content: trimmedContent,
    });
  }
}

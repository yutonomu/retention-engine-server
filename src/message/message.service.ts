import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MessagePort, PaginatedMessages } from './message.port';
import { MESSAGE_PORT } from './message.port';
import type { ConversationPort } from '../conversation/conversation.port';
import { CONVERSATION_PORT } from '../conversation/conversation.port';
import { MENTOR_ASSIGNMENT_PORT } from '../mentor-assignment/mentor-assignment.port';
import type { MentorAssignmentPort } from '../mentor-assignment/mentor-assignment.port';
import type { Message } from './message.types';

@Injectable()
export class MessageService {
  constructor(
    @Inject(MESSAGE_PORT)
    private readonly messageRepository: MessagePort,
    @Inject(CONVERSATION_PORT)
    private readonly conversationRepository: ConversationPort,
    @Inject(MENTOR_ASSIGNMENT_PORT)
    private readonly mentorAssignmentRepository: MentorAssignmentPort,
  ) {}

  async getMessagesByConversation(convId: string): Promise<Message[]> {
    if (!convId?.trim()) {
      throw new BadRequestException('convId is required');
    }
    const conversation = await this.conversationRepository.findById(convId);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }
    return this.messageRepository.findAllByConversation(convId);
  }

  async getMessagesByConversationPaginated(
    convId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<PaginatedMessages> {
    if (!convId?.trim()) {
      throw new BadRequestException('convId is required');
    }
    const conversation = await this.conversationRepository.findById(convId);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }
    return this.messageRepository.findByConversationPaginated(convId, options);
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
    const conversation = await this.conversationRepository.findById(input.convId);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${input.convId} not found`);
    }
    return this.messageRepository.createMessage({
      convId: input.convId,
      role: input.role,
      content: trimmedContent,
    });
  }

  async getMessagesForMentor(
    mentorId: string,
    convId: string,
  ): Promise<Message[]> {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    if (!convId?.trim()) {
      throw new BadRequestException('convId is required');
    }
    const conversation = await this.conversationRepository.findById(convId);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }
    const assignment =
      await this.mentorAssignmentRepository.findByMentorId(mentorId);
    if (
      !assignment ||
      !assignment.newhire_ids.includes(conversation.owner_id)
    ) {
      throw new ForbiddenException(
        'Mentor is not assigned to this conversation.',
      );
    }
    return this.messageRepository.findAllByConversation(convId);
  }
}

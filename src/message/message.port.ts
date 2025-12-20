import type { Message } from './message.types';

export interface PaginatedMessages {
  items: Message[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface MessagePort {
  findById(messageId: string): Promise<Message>;
  findAllByConversation(convId: string): Promise<Message[]>;
  findByConversationPaginated(
    convId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<PaginatedMessages>;
  createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
  }): Promise<Message>;
}

export const MESSAGE_PORT = 'MESSAGE_PORT';

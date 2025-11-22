import type { Message } from './message.types';

export interface MessagePort {
  findById(messageId: string): Promise<Message>;
  findAllByConversation(convId: string): Promise<Message[]>;
  createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
  }): Promise<Message>;
}

export const MESSAGE_PORT = 'MESSAGE_PORT';

export type UserRole = 'NEW_HIRE' | 'ASSISTANT';

export interface Message {
  messageId: string;
  conversationId: string;
  role: UserRole;
  content: string;
  createdAt: Date;
}

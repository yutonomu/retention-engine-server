export type ConversationState = 'archive' | 'active';

export interface Conversation {
  convId: string;
  ownerId: string;
  title: string;
  createdAt: Date;
  lastActiveAt: Date;
  state: ConversationState;
}

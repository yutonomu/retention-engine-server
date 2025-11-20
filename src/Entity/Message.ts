import type { UUID } from '../common/uuid';

// TODO:Entity/User.tsに移動する
export type UserRole = 'NEW_HIRE' | 'ASSISTANT';

export interface Message {
  messageId: UUID;
  conversationId: UUID;
  userRole: UserRole;
  content: string;
  createdAt: Date;
}

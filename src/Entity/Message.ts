// TODO:Entity/User.tsに移動する
export type UserRole = 'NEW_HIRE' | 'ASSISTANT';

export interface Message {
  messageId: string;
  conversationId: string;
  userRole: UserRole;
  content: string;
  createdAt: Date;
}

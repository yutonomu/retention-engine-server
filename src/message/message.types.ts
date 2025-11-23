export type MessageRole = 'NEW_HIRE' | 'ASSISTANT';

export interface Message {
  msg_id: string;
  conv_id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
}

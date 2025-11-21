export type MessageRole = 'NEW_HIRE' | 'MENTOR' | 'SYSTEM';

export interface Message {
  msg_id: string;
  conv_id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
}

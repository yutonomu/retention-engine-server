export type ConversationState = 'archive' | 'active';
export type ConversationType = 'student_chat' | 'mentor_ai_chat';

export interface Conversation {
  conv_id: string;
  owner_id: string;
  title: string;
  type: ConversationType;
  state: ConversationState;
  created_at: Date;
  last_active_at: Date;
}

export interface GetActiveConversationListForMentorReturn {
  conv_id: string;
  owner_name: string;
  title: string;
  created_at: Date;
}

export interface GetConversationListByNewHireReturn {
  conv_id: string;
  title: string;
  created_at: Date;
}

export interface GetMentorAiConversationListReturn {
  conv_id: string;
  title: string;
  state: ConversationState;
  created_at: Date;
  last_active_at: Date;
  knowledge_card_count: number;
}

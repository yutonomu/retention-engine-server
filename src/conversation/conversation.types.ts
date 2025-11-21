export type ConversationState = 'archive' | 'active';

export interface Conversation {
  conv_id: string;
  owner_id: string;
  title: string;
  state: ConversationState;
  created_at: Date;
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

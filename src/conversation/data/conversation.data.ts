import { Conversation } from '../conversation.types';

export const conversationData: Conversation[] = [
  {
    conv_id: 'conv-001',
    owner_id: 'user-001',
    title: 'Git ブランチ戦略',
    state: 'active',
    created_at: new Date('2025-01-01T09:00:00Z'),
  },
  {
    conv_id: 'conv-002',
    owner_id: 'user-002',
    title: 'オンボーディング Q&A',
    state: 'archive',
    created_at: new Date('2025-01-05T08:15:00Z'),
  },
];

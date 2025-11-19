import { Conversation } from '../conversation.types';

export const conversationData: Conversation[] = [
  {
    convId: 'conv-1',
    ownerId: 'user-001',
    title: 'Git ブランチ戦略',
    createdAt: new Date('2025-01-01T09:00:00Z'),
    lastActiveAt: new Date('2025-01-02T10:30:00Z'),
    state: 'active',
  },
  {
    convId: 'conv-2',
    ownerId: 'user-002',
    title: 'オンボーディング Q&A',
    createdAt: new Date('2025-01-05T08:15:00Z'),
    lastActiveAt: new Date('2025-01-06T14:45:00Z'),
    state: 'archive',
  },
];

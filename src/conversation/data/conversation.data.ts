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
  {
    conv_id: 'conv-003',
    owner_id: 'user-003',
    title: 'TypeScript ベストプラクティス',
    state: 'active',
    created_at: new Date('2025-01-08T10:20:00Z'),
  },
  {
    conv_id: 'conv-004',
    owner_id: 'user-005',
    title: 'プロジェクト管理ツールの使い方',
    state: 'active',
    created_at: new Date('2025-01-03T11:45:00Z'),
  },
  {
    conv_id: 'conv-005',
    owner_id: 'user-001',
    title: '障害対応のフロー確認',
    state: 'archive',
    created_at: new Date('2024-12-28T13:30:00Z'),
  },
];

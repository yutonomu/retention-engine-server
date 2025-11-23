import { Message } from '../message.types';

export const messageData: Message[] = [
  {
    msg_id: 'msg-001',
    conv_id: 'conv-001',
    role: 'NEW_HIRE',
    content: '入社初日の不安を共有します。',
    created_at: new Date('2025-01-01T10:00:00Z'),
  },
  {
    msg_id: 'msg-002',
    conv_id: 'conv-001',
    role: 'ASSISTANT',
    content: '大丈夫ですよ。気になる点を質問してください。',
    created_at: new Date('2025-01-01T10:05:00Z'),
  },
  {
    msg_id: 'msg-003',
    conv_id: 'conv-002',
    role: 'NEW_HIRE',
    content: 'オンボーディング資料の場所を教えてください。',
    created_at: new Date('2025-01-05T09:00:00Z'),
  },
  {
    msg_id: 'msg-004',
    conv_id: 'conv-002',
    role: 'ASSISTANT',
    content: 'Confluence の Onboarding スペースを確認してくださいね。',
    created_at: new Date('2025-01-05T09:10:00Z'),
  },
  {
    msg_id: 'msg-005',
    conv_id: 'conv-003',
    role: 'NEW_HIRE',
    content: 'TypeScript の型で混乱している箇所があります。',
    created_at: new Date('2025-01-08T10:25:00Z'),
  },
  {
    msg_id: 'msg-006',
    conv_id: 'conv-003',
    role: 'ASSISTANT',
    content: 'Generics を使った設計例を共有します。',
    created_at: new Date('2025-01-08T10:35:00Z'),
  },
  {
    msg_id: 'msg-007',
    conv_id: 'conv-004',
    role: 'NEW_HIRE',
    content: 'プロジェクト管理ツールで何を入力すればよいですか？',
    created_at: new Date('2025-01-03T11:50:00Z'),
  },
  {
    msg_id: 'msg-008',
    conv_id: 'conv-004',
    role: 'ASSISTANT',
    content: 'タスク名・担当者・期限を必ず追加してください。',
    created_at: new Date('2025-01-03T11:55:00Z'),
  },
  {
    msg_id: 'msg-009',
    conv_id: 'conv-005',
    role: 'NEW_HIRE',
    content: '障害対応で気をつけるポイントを教えてください。',
    created_at: new Date('2024-12-28T13:35:00Z'),
  },
  {
    msg_id: 'msg-010',
    conv_id: 'conv-005',
    role: 'ASSISTANT',
    content: '影響範囲の共有とエスカレーションルールを最優先で確認しましょう。',
    created_at: new Date('2024-12-28T13:45:00Z'),
  },
];

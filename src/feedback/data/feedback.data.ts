import { Feedback } from '../feedback.types';

export const feedbackData: Feedback[] = [
  {
    fb_id: 'fb-001',
    target_msg_id: 'msg-001',
    author_id: 'user-002',
    content: '不安に感じた点をもう少し具体的に教えてください。',
    created_at: new Date('2025-01-01T10:10:00Z'),
  },
  {
    fb_id: 'fb-002',
    target_msg_id: 'msg-003',
    author_id: 'user-002',
    content: '資料は Confluence のオンボーディングスペースにあります。',
    created_at: new Date('2025-01-05T09:05:00Z'),
  },
  {
    fb_id: 'fb-003',
    target_msg_id: 'msg-005',
    author_id: 'user-002',
    content: '型定義はユースケースごとに分けてみましょう。',
    created_at: new Date('2025-01-08T10:40:00Z'),
  },
  {
    fb_id: 'fb-004',
    target_msg_id: 'msg-007',
    author_id: 'user-004',
    content: '入力項目はテンプレートに沿って埋めてください。',
    created_at: new Date('2025-01-03T12:05:00Z'),
  },
];

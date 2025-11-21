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
    role: 'MENTOR',
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
];

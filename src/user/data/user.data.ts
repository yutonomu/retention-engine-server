import { User } from '../user.types';

export const userData: User[] = [
  {
    user_id: 'user-001',
    role: 'NEW_HIRE',
    display_name: '佐藤 太郎',
    email: 'taro.sato@example.com',
    created_at: new Date('2024-12-15T05:00:00Z'),
  },
  {
    user_id: 'user-002',
    role: 'MENTOR',
    display_name: '山田 花子',
    email: 'hanako.yamada@example.com',
    created_at: new Date('2024-12-10T03:20:00Z'),
  },
  {
    user_id: 'user-003',
    role: 'NEW_HIRE',
    display_name: '鈴木 次郎',
    email: 'jiro.suzuki@example.com',
    created_at: new Date('2024-12-18T01:15:00Z'),
  },
  {
    user_id: 'user-004',
    role: 'MENTOR',
    display_name: '佐々木 由美',
    email: 'yumi.sasaki@example.com',
    created_at: new Date('2024-11-30T02:05:00Z'),
  },
  {
    user_id: 'user-005',
    role: 'NEW_HIRE',
    display_name: '田中 蓮',
    email: 'ren.tanaka@example.com',
    created_at: new Date('2024-12-20T08:45:00Z'),
  },
];

import { Injectable } from '@nestjs/common';
import { User } from './user.types';

@Injectable()
export class UserService {
  private readonly users: User[] = [
    {
      userId: 'user-001',
      role: 'NEW_HIRE',
      displayName: '佐藤 太郎',
      email: 'taro.sato@example.com',
      createdAt: new Date('2024-12-15T05:00:00Z'),
    },
    {
      userId: 'user-002',
      role: 'MENTOR',
      displayName: '山田 花子',
      email: 'hanako.yamada@example.com',
      createdAt: new Date('2024-12-10T03:20:00Z'),
    },
  ];
}

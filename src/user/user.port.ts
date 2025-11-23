import type { User } from './user.types';

export interface UserPort {
  getUsers(): Promise<User[]>;
  findUserById(userId: string): Promise<User | undefined>;
  findUserNameById(userId: string): Promise<string | undefined>;
  upsertUser(user: User): Promise<void>;
}

export const USER_PORT = 'USER_PORT';

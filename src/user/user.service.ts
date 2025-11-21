import { Injectable } from '@nestjs/common';
import { User } from './user.types';
import { userData } from './data/user.data';

@Injectable()
export class UserService {
  private readonly users: User[] = userData;

  getUsers(): User[] {
    return this.users;
  }

  findUserById(userId: string): User | undefined {
    return this.users.find((user) => user.user_id === userId);
  }

  findUserNameById(userId: string): string | undefined {
    return this.findUserById(userId)?.display_name;
  }
}

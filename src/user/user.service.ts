import { Injectable } from '@nestjs/common';
import { User } from './user.types';
import { userData } from './data/user.data';

@Injectable()
export class UserService {
  private readonly users: User[] = userData;
}

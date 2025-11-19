import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.types';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getUsers(): User[] {
    return this.userService.getUsers();
  }
}

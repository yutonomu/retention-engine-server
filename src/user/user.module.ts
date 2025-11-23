import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { USER_PORT } from './user.port';

@Module({
  providers: [
    UserService,
    {
      provide: USER_PORT,
      useExisting: UserService,
    },
  ],
  controllers: [UserController],
  exports: [UserService, USER_PORT],
})
export class UserModule {}

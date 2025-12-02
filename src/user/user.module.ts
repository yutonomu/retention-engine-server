import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { USER_PORT } from './user.port';
import { AuthModule } from '../auth/auth.module';
import { PersonalityPresetModule } from '../personality-preset/personalityPreset.module';

@Module({
  imports: [AuthModule, PersonalityPresetModule],
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
export class UserModule { }

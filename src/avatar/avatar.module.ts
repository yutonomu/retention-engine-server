import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { AvatarController } from './avatar.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [AvatarService],
  controllers: [AvatarController],
  exports: [AvatarService],
})
export class AvatarModule {}

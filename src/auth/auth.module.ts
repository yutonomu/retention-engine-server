import { Module } from '@nestjs/common';
import { JwksService } from './jwks.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  providers: [JwksService, JwtAuthGuard],
  exports: [JwksService, JwtAuthGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LlmModule } from './llm/llm.module';
import { ConversationModule } from './conversation/conversation.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LlmModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

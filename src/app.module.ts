import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LlmModule } from './llm/llm.module';
import { ConversationModule } from './conversation/conversation.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [LlmModule, ConversationModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

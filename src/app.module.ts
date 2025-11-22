import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LlmModule } from './llm/llm.module';
import { FeedbackModule } from './feedback/feedback.module';
import { MentorAssignmentModule } from './mentor-assignment/mentor-assignment.module';
import { ConversationModule } from './conversation/conversation.module';
import { UserModule } from './user/user.module';
import { MessageModule } from './message/message.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LlmModule,
    FeedbackModule,
    MentorAssignmentModule,
    ConversationModule,
    UserModule,
    MessageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

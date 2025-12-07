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
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { PersonalityPresetModule } from './personality-preset/personalityPreset.module';
import { AvatarModule } from './avatar/avatar.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    LlmModule,
    FeedbackModule,
    MentorAssignmentModule,
    ConversationModule,
    UserModule,
    MessageModule,
    PersonalityPresetModule,
    AvatarModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

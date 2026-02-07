import { Module } from '@nestjs/common';
import { AnswerCardController } from './answer-card.controller';
import { AnswerCardService } from './answer-card.service';
import { AnswerCardRepository } from './answer-card.repository';
import { ANSWER_CARD_PORT } from './answer-card.port';
import { SupabaseModule } from '../supabase/supabase.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { QuestionCardModule } from '../question-card/question-card.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [SupabaseModule, UserModule, AuthModule, QuestionCardModule, KnowledgeModule],
  controllers: [AnswerCardController],
  providers: [
    AnswerCardService,
    {
      provide: ANSWER_CARD_PORT,
      useClass: AnswerCardRepository,
    },
  ],
  exports: [AnswerCardService],
})
export class AnswerCardModule {}

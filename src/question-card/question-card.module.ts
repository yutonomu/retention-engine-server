import { Module } from '@nestjs/common';
import { QuestionCardController } from './question-card.controller';
import { QuestionCardService } from './question-card.service';
import { QuestionCardRepository } from './question-card.repository';
import { QUESTION_CARD_PORT } from './question-card.port';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [QuestionCardController],
  providers: [
    QuestionCardService,
    {
      provide: QUESTION_CARD_PORT,
      useClass: QuestionCardRepository,
    },
  ],
  exports: [QuestionCardService],
})
export class QuestionCardModule {}

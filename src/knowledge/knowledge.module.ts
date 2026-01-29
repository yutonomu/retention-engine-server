import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRepository } from './knowledge.repository';
import { KNOWLEDGE_PORT } from './knowledge.port';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    {
      provide: KNOWLEDGE_PORT,
      useClass: KnowledgeRepository,
    },
  ],
  exports: [KnowledgeService, KNOWLEDGE_PORT],
})
export class KnowledgeModule {}

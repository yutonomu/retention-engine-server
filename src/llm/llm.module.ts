import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { JsonMessageDataAccess } from './repositories/JsonMessageDataAccess';
import { GeminiFileSearchAssistantService } from './external/geminiFileSearchAssistant/geminiFileSearchAssistantService';
import { FileSearchAssistant } from './external/fileSearchAssistant';
import { MessageModule } from '../message/message.module';
import { GeminiTextService } from './external/geminiTextService';
import { UserModule } from '../user/user.module';
import { ConversationModule } from '../conversation/conversation.module';
import { PersonalityPresetModule } from '../personality-preset/personalityPreset.module';

// Hybrid RAG関連imports
import { WebSearchAssistant } from './external/webSearchAssistant';
import { GeneralKnowledgeAssistant } from './external/generalKnowledgeAssistant';
import { HybridRagAssistant } from './external/hybridRagAssistant';
import { InMemoryCacheService } from './cache/inMemoryCacheService';
import { GeminiCacheService } from './cache/geminiCacheService';

// 元のFileSearchAssistant用トークン
const ORIGINAL_FILE_SEARCH_ASSISTANT = 'ORIGINAL_FILE_SEARCH_ASSISTANT';

@Module({
  imports: [MessageModule, UserModule, ConversationModule, PersonalityPresetModule],
  controllers: [LlmController],
  providers: [
    LlmService,
    JsonMessageDataAccess,
    GeminiTextService,
    InMemoryCacheService,
    GeminiCacheService,

    // 元のFileSearchAssistant (GeminiFileSearchAssistantService)
    {
      provide: ORIGINAL_FILE_SEARCH_ASSISTANT,
      useClass: GeminiFileSearchAssistantService,
    },

    // WebSearchAssistant
    {
      provide: WebSearchAssistant,
      useFactory: () => {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
          throw new Error('GOOGLE_API_KEY is required for WebSearchAssistant');
        }
        return new WebSearchAssistant(apiKey);
      },
    },

    // GeneralKnowledgeAssistant
    {
      provide: GeneralKnowledgeAssistant,
      useFactory: () => {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
          throw new Error('GOOGLE_API_KEY is required for GeneralKnowledgeAssistant');
        }
        return new GeneralKnowledgeAssistant(apiKey);
      },
    },

    // HybridRagAssistant (FileSearchAssistantインターフェースとして提供)
    {
      provide: FileSearchAssistant,
      useFactory: (
        ragService: FileSearchAssistant,
        webService: WebSearchAssistant,
        generalService: GeneralKnowledgeAssistant,
      ) => {
        return new HybridRagAssistant(ragService, webService, generalService);
      },
      inject: [ORIGINAL_FILE_SEARCH_ASSISTANT, WebSearchAssistant, GeneralKnowledgeAssistant],
    },
  ],
  exports: [LlmService, GeminiTextService],
})
export class LlmModule {}

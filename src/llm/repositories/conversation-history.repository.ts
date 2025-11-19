import { Injectable } from '@nestjs/common';
import type {
  ConversationHistoryStore,
  ConversationTurn,
} from '../llm.service';
import { conversationHistoryData } from '../data/conversation-history.data';

@Injectable()
export class ConversationHistoryRepository implements ConversationHistoryStore {
  load(conversationId: string): Promise<ConversationTurn[]> {
    return Promise.resolve(conversationHistoryData[conversationId] ?? []);
  }

  append(conversationId: string, turns: ConversationTurn[]): Promise<void> {
    const existing = conversationHistoryData[conversationId] ?? [];
    conversationHistoryData[conversationId] = [...existing, ...turns];
    return Promise.resolve();
  }
}

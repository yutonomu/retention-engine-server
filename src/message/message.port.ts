import type { Message, TriggerType } from './message.types';

export interface PaginatedMessages {
  items: Message[];
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * トリガー集計結果 (Story 2-6)
 */
export interface TriggerAggregation {
  triggerType: TriggerType;
  count: number;
  excerpts: string[];
}

export interface MessagePort {
  findById(messageId: string): Promise<Message>;
  findAllByConversation(convId: string): Promise<Message[]>;
  findByConversationPaginated(
    convId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<PaginatedMessages>;
  createMessage(input: {
    convId: string;
    role: Message['role'];
    content: string;
    triggerType?: TriggerType | null;
    triggerConfidence?: number | null;
    triggerExcerpt?: string | null;
  }): Promise<Message>;

  /**
   * 会話内のトリガー集計 (Story 2-6: KC生成トリガー用)
   */
  aggregateTriggersByConversation(
    convId: string,
  ): Promise<TriggerAggregation[]>;
}

export const MESSAGE_PORT = 'MESSAGE_PORT';

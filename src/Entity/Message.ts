import type { UUID } from '../common/uuid';
import type { TriggerType } from '../message/message.types';

// TODO:Entity/User.tsに移動する
export type UserRole = 'NEW_HIRE' | 'MENTOR' | 'ASSISTANT';

export interface Message {
  messageId: UUID;
  conversationId: UUID;
  userRole: UserRole;
  content: string;
  createdAt: Date;
  // Story 2-6: 暗黙知トリガー検出メタデータ
  triggerType?: TriggerType | null;
  triggerConfidence?: number | null;
  triggerExcerpt?: string | null;
}

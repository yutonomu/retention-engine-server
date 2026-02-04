export type MessageRole = 'NEW_HIRE' | 'MENTOR' | 'ASSISTANT';

/**
 * 暗黙知トリガータイプ (Story 2-6)
 */
export type TriggerType =
  | 'REBUTTAL'
  | 'SHARP_INSIGHT'
  | 'ALTERNATIVE_PERSPECTIVE'
  | 'EXPERIENCE_SHARING'
  | 'QUANTIFICATION';

export interface Message {
  msg_id: string;
  conv_id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
  // Story 2-6: 暗黙知トリガー検出メタデータ
  trigger_type?: TriggerType | null;
  trigger_confidence?: number | null;
  trigger_excerpt?: string | null;
}

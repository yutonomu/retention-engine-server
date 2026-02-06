/**
 * TriggerSession 타입 정의
 *
 * Story 2-10: 자동 히어링에 의한 암묵지 카드 생성
 * 트리거 검출 후, 자동으로 후속질문(히어링)을 진행하여
 * 충분한 정보가 모였을 때 KC를 자동 생성하는 세션 관리
 */

import type { UUID } from '../common/uuid';

/**
 * TriggerSession 상태
 */
export type TriggerSessionStatus =
  | 'hearing' // 히어링 진행 중
  | 'ready' // KC 생성 준비 완료
  | 'created' // KC 생성됨
  | 'dismissed'; // 무시됨

/**
 * 트리거 타입 (Story 2-9와 동일)
 */
export type TriggerType =
  | 'REBUTTAL'
  | 'SHARP_INSIGHT'
  | 'ALTERNATIVE_PERSPECTIVE'
  | 'EXPERIENCE_SHARING'
  | 'QUANTIFICATION';

/**
 * 완성된 KC 후보 구조
 */
export interface KCCandidate {
  title: string;
  situation: string;
  knowhow: string;
  precaution: string;
  tags: string[];
  importance: string;
}

/**
 * 축적된 메시지 (히어링 중)
 */
export interface AccumulatedMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * TriggerSession 엔티티
 */
export interface TriggerSession {
  id: string;
  conversationId: UUID;
  /** 트리거가 발생한 사용자 메시지 ID (별 표시용) */
  triggerMsgId?: string;
  status: TriggerSessionStatus;
  triggerType: TriggerType;
  hearingRound: number;
  maxHearingRounds: number;
  accumulatedMessages: AccumulatedMessage[];
  partialKC: Partial<KCCandidate>;
  completenessScore: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 프론트엔드로 보내는 TriggerSession 응답
 */
export interface TriggerSessionResponse {
  id: string;
  status: TriggerSessionStatus;
  hearingRound: number;
  /** 트리거가 발생한 사용자 메시지 ID (별 표시용) */
  triggerMsgId?: string;
  kcCandidate?: KCCandidate; // status='ready' 시에만 포함
}

/**
 * 기본 히어링 라운드 수
 */
export const DEFAULT_MAX_HEARING_ROUNDS = 3;

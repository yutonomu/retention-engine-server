/**
 * TriggerSession 서비스
 *
 * Story 2-10: 자동 히어링에 의한 암묵지 카드 생성
 * 인메모리 TriggerSession 상태 관리
 */

import { Injectable, Logger } from '@nestjs/common';
import type { UUID } from '../common/uuid';
import { createUUID } from '../common/uuid';
import {
  type TriggerSession,
  type TriggerSessionStatus,
  type TriggerType,
  type KCCandidate,
  type AccumulatedMessage,
  DEFAULT_MAX_HEARING_ROUNDS,
} from './triggerSession.types';

@Injectable()
export class TriggerSessionService {
  private readonly logger = new Logger(TriggerSessionService.name);

  /**
   * 인메모리 세션 저장소
   * key: conversationId, value: TriggerSession
   * 1 회화당 1개의 활성 세션만 허용
   */
  private sessions: Map<string, TriggerSession> = new Map();

  /**
   * 회화에 활성 히어링 세션이 있는지 확인
   */
  findActiveSession(conversationId: UUID): TriggerSession | null {
    const session = this.sessions.get(conversationId.toString());
    if (session && session.status === 'hearing') {
      return session;
    }
    return null;
  }

  /**
   * 새 TriggerSession 생성 (히어링 시작)
   * @param triggerMsgId 트리거가 발생한 사용자 메시지 ID (FE에서 별 표시에 사용)
   */
  createSession(
    conversationId: UUID,
    triggerType: TriggerType,
    initialKC: Partial<KCCandidate>,
    initialMessages: AccumulatedMessage[],
    triggerMsgId?: string,
  ): TriggerSession {
    const session: TriggerSession = {
      id: createUUID(),
      conversationId,
      triggerMsgId,
      status: 'hearing',
      triggerType,
      hearingRound: 1,
      maxHearingRounds: DEFAULT_MAX_HEARING_ROUNDS,
      accumulatedMessages: initialMessages,
      partialKC: initialKC,
      completenessScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 기존 세션이 있으면 덮어쓰기 (1회화 1세션 정책)
    this.sessions.set(conversationId.toString(), session);

    this.logger.log(
      `[TriggerSession] Created session: id=${session.id} ` +
        `conversationId=${conversationId} triggerType=${triggerType} triggerMsgId=${triggerMsgId}`,
    );

    return session;
  }

  /**
   * 세션에 메시지 추가 및 라운드 증가
   */
  addMessageAndAdvanceRound(
    conversationId: UUID,
    userMessage: string,
    assistantMessage: string,
  ): TriggerSession | null {
    const session = this.sessions.get(conversationId.toString());
    if (!session || session.status !== 'hearing') {
      return null;
    }

    session.accumulatedMessages.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantMessage },
    );
    session.hearingRound += 1;
    session.updatedAt = new Date();

    this.logger.log(
      `[TriggerSession] Advanced to round ${session.hearingRound}: id=${session.id}`,
    );

    return session;
  }

  /**
   * 세션 상태 업데이트 (KC 완성 등)
   */
  updateSession(
    conversationId: UUID,
    updates: {
      status?: TriggerSessionStatus;
      partialKC?: Partial<KCCandidate>;
      completenessScore?: number;
    },
  ): TriggerSession | null {
    const session = this.sessions.get(conversationId.toString());
    if (!session) {
      return null;
    }

    if (updates.status !== undefined) {
      session.status = updates.status;
    }
    if (updates.partialKC !== undefined) {
      session.partialKC = { ...session.partialKC, ...updates.partialKC };
    }
    if (updates.completenessScore !== undefined) {
      session.completenessScore = updates.completenessScore;
    }
    session.updatedAt = new Date();

    this.logger.log(
      `[TriggerSession] Updated session: id=${session.id} ` +
        `status=${session.status} score=${session.completenessScore}`,
    );

    return session;
  }

  /**
   * 세션 완료 처리 (KC 생성 준비 완료)
   */
  completeSession(
    conversationId: UUID,
    finalKC: KCCandidate,
    completenessScore: number,
  ): TriggerSession | null {
    const session = this.sessions.get(conversationId.toString());
    if (!session) {
      return null;
    }

    session.status = 'ready';
    session.partialKC = finalKC;
    session.completenessScore = completenessScore;
    session.updatedAt = new Date();

    this.logger.log(
      `[TriggerSession] Session ready for KC creation: id=${session.id} ` +
        `score=${completenessScore} title="${finalKC.title}"`,
    );

    return session;
  }

  /**
   * 세션 삭제 (무시 또는 완료 후 정리)
   */
  removeSession(conversationId: UUID): void {
    const removed = this.sessions.delete(conversationId.toString());
    if (removed) {
      this.logger.log(
        `[TriggerSession] Removed session for conversationId=${conversationId}`,
      );
    }
  }

  /**
   * 세션을 dismissed로 표시
   */
  dismissSession(conversationId: UUID): TriggerSession | null {
    return this.updateSession(conversationId, { status: 'dismissed' });
  }

  /**
   * 세션을 created로 표시 (KC 저장 완료)
   */
  markAsCreated(conversationId: UUID): TriggerSession | null {
    return this.updateSession(conversationId, { status: 'created' });
  }
}

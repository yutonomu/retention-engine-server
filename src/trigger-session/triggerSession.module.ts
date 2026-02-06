/**
 * TriggerSession 모듈
 *
 * Story 2-10: 자동 히어링에 의한 암묵지 카드 생성
 */

import { Module, Global } from '@nestjs/common';
import { TriggerSessionService } from './triggerSession.service';

@Global()
@Module({
  providers: [TriggerSessionService],
  exports: [TriggerSessionService],
})
export class TriggerSessionModule {}

# 프론트엔드 API Rate Limit 분석 보고서

## 🔍 분석 개요
- **분석 대상**: RetentionEngineView 프론트엔드 API Gateway 호출 패턴
- **발생 문제**: 429 Rate Limit 에러
- **분석 일시**: 2025-12-19

---

## 📋 API Gateway 아키텍처

### Gateway 구조
```
StudentChatGateway (Facade, Deprecated)
├── MessageGateway
├── FeedbackGateway
├── ConversationGateway
└── LLMGateway
```

### 주요 엔드포인트

| Gateway | 메서드 | 엔드포인트 | HTTP Method |
|---------|--------|-----------|-------------|
| MessageGateway | `createUserMessage` | `/api/entitle/student-chat` | POST |
| MessageGateway | `listConversationMessages` | `/api/entitle/student-chat` | POST |
| MessageGateway | `listConversationMessagesPaginated` | `/api/entitle/student-chat` | POST |
| MessageGateway | `finalizeAssistantMessage` | `/api/entitle/student-chat` | POST |
| ConversationGateway | `fetchBootstrap` | `/api/entitle/student-chat?convId=...` | GET |
| ConversationGateway | `listConversations` | - | 내부적으로 `fetchBootstrap` 호출 |
| ConversationGateway | `getConversation` | - | 내부적으로 `fetchBootstrap` 호출 |
| ConversationGateway | `createConversation` | `/api/entitle/student-chat` | POST |
| ConversationGateway | `deleteConversation` | `/api/entitle/student-chat` | POST |
| FeedbackGateway | `createFeedback` | `/api/entitle/student-chat` | POST |
| FeedbackGateway | `listFeedbacks` | `/api/entitle/student-chat` | POST |
| LLMGateway | `generateResponse` | `/api/llm/generate` | POST |
| StudentDashboardGateway | `listConversations` | `/api/entitle/conversations` | GET |

---

## ⚠️ 발견된 문제점

### 1. **중복 호출 문제: `fetchBootstrap`의 남용**

#### 문제 상황
`ConversationGateway`의 `listConversations()` 메서드는 내부적으로 `fetchBootstrap()`을 호출합니다:

```typescript
// ConversationGateway.ts 46-57줄
async listConversations(): Promise<Conversation[]> {
  const bootstrap = await this.fetchBootstrap();  // ⚠️ Bootstrap 전체를 로드
  return bootstrap.availableConversations.map((opt) => ({
    convId: opt.convId,
    title: opt.title,
    ownerId: bootstrap.currentUser.userId,
    state: "ACTIVE" as const,
    createdAt: opt.lastActiveAt,
    lastActiveAt: opt.lastActiveAt,
  }));
}
```

#### 문제점
- `fetchBootstrap`은 **전체 초기화 데이터**를 로드하는 무거운 API
- 단순히 대화 목록만 필요한 상황에서도 불필요한 데이터를 모두 가져옴
- `StudentDashboardPresenter`에서 초기 로드와 매번 리프레시 시 호출

#### 영향
```typescript
// useStudentDashboardPresenter.ts 120-149줄
const loadConversations = useCallback(async () => {
  const result = await service.fetchConversations();  // ⚠️ fetchBootstrap 호출
  // ...
}, [studentId, service]);

// 호출 시점:
// 1. 초기 로드 (useEffect)
// 2. 대화 생성 후 (createConversation)
// 3. 대화 삭제 후 (deleteConversation)
// 4. 수동 리프레시 (refresh)
```

#### ✅ 해결책
**별도 경량 API 사용**:
```typescript
// StudentDashboardGateway.ts - 이미 구현됨!
async listConversations(): Promise<ConversationListItem[]> {
  const result = await apiFetch<StudentDashboardBootstrap>("/api/entitle/conversations", {
    method: "GET",
    accessToken: this.accessToken,
    cacheTtl: 30 * 1000,  // ✅ 30초 캐싱
  });
  return result.data?.conversations ?? [];
}
```

**현재 상태**: `StudentDashboardPresenter`는 이미 `StudentDashboardService`를 통해 경량 API를 사용 중 ✅

---

### 2. **캐싱 불일치 문제**

#### 캐싱 설정 분석

| API | 캐시 TTL | 적절성 |
|-----|----------|--------|
| `fetchBootstrap(convId)` | **0초 (캐싱 없음)** | ❌ 너무 짧음 |
| `fetchBootstrap()` (대시보드) | 30초 | ✅ 적절 |
| `listConversations` (경량 API) | 30초 | ✅ 적절 |

#### 문제점
```typescript
// ConversationGateway.ts 90-101줄
async fetchBootstrap(convId?: string): Promise<StudentChatBootstrap> {
  const result = await apiFetch<StudentChatBootstrap>(url, {
    method: "GET",
    accessToken: this.accessToken,
    cacheTtl: convId ? 0 : 30 * 1000,  // ⚠️ convId가 있으면 캐싱 없음!
  });
  // ...
}
```

**특정 대화 조회 시 매번 서버 요청** → Rate Limit 위험

#### ✅ 해결책
```typescript
cacheTtl: convId ? 10 * 1000 : 30 * 1000,  // 10초 캐싱 추가
```

---

### 3. **React Query 미사용 영역**

#### React Query 사용 현황

✅ **사용 중**:
- `useMessagesQuery` - 메시지 목록 조회
- `useInfiniteMessagesQuery` - 무한 스크롤
- `useSendMessage` - 메시지 전송 (Optimistic Update)
- `useBootstrapQuery` - Bootstrap 데이터

❌ **미사용** (순수 Service/Presenter 패턴):
- `useStudentDashboardPresenter` - 대시보드 대화 목록

#### 문제점
- React Query는 **자동 중복 제거**, **백그라운드 리페치**, **캐싱** 기능 제공
- Presenter 패턴은 수동 상태 관리 → 중복 요청 가능성

#### ✅ 해결책
현재는 `StudentDashboardGateway`가 경량 API + 30초 캐싱을 사용하므로 문제 없음. 하지만 향후 React Query 통합 고려 가능.

---

### 4. **불필요한 API 호출 패턴**

#### InitialDataUseCase의 이중 호출
```typescript
// initialDataUseCase.ts 48-63줄
async execute(requester, convId?) {
  let data = await this.initialDataPort.fetchBootstrap(convId);  // 1차 호출

  if (!data.conversation && requester.role === "NEW_HIRE") {
    const createResult = await this.conversationUseCase.create({...});

    // ⚠️ 대화 생성 직후 다시 fetchBootstrap!
    data = await this.initialDataPort.fetchBootstrap(createResult.value.convId);  // 2차 호출
  }
  // ...
}
```

#### 문제점
- 신규 사용자 첫 방문 시 `fetchBootstrap` 2회 호출
- 첫 호출에서 이미 사용자 정보를 알고 있는데 불필요한 재호출

#### ✅ 해결책
```typescript
// 대화 생성 시 반환값에 필요한 Bootstrap 데이터 포함
const createResult = await this.conversationUseCase.create({...});
if (createResult.kind === "success") {
  data = {
    conversation: createResult.value,
    currentUser: data.currentUser,  // 기존 데이터 재사용
    availableConversations: [createResult.value],
    // ...
  };
}
```

---

## 🎯 Rate Limit 원인 분석

### 가능한 시나리오

#### 시나리오 1: 대화 상세 페이지 반복 진입
```
1. 사용자가 대화 A 진입 → fetchBootstrap(convIdA) [캐싱 없음]
2. 뒤로가기 → 대시보드
3. 다시 대화 A 진입 → fetchBootstrap(convIdA) [캐싱 없음, 중복 호출!]
4. 반복...
```

**원인**: `fetchBootstrap(convId)`의 **cacheTtl: 0**

#### 시나리오 2: 메시지 폴링
```typescript
// useMessagesQuery.ts 50-52줄
staleTime: 0,  // ⚠️ 메시지는 항상 최신 유지
refetchOnWindowFocus: true,  // ⚠️ 윈도우 포커스 시 재조회
```

**원인**: 탭 전환 시마다 메시지 재조회

#### 시나리오 3: 컴포넌트 리렌더링 중복 호출
- Presenter의 `loadConversations`가 여러 번 호출될 수 있는 상황
- 하지만 현재 `hasLoadedInitial.current`로 방지 중 ✅

---

## 📊 API 호출 빈도 추정

### 정상적인 사용자 행동 (5분간)
```
1. 대시보드 진입: GET /api/entitle/conversations (1회)
2. 대화 A 진입: GET /api/entitle/student-chat?convId=A (1회)
3. 메시지 조회: POST /api/entitle/student-chat [listConversationMessages] (1회)
4. 메시지 전송: POST /api/entitle/student-chat [createUserMessage] (3회)
5. LLM 응답: POST /api/llm/generate (3회)
6. 윈도우 포커스 리페치: POST /api/entitle/student-chat [listConversationMessages] (5회)

총 14회 (5분)
```

### 캐싱 없을 경우 (최악 시나리오)
```
1. 대화 A ↔ 대시보드 반복 (10회)
   → fetchBootstrap(convId): 10회
   → listConversations: 10회
2. 메시지 조회 (윈도우 포커스 포함): 20회

총 40회 (5분) ⚠️ Rate Limit 위험!
```

---

## 🛠️ 권장 해결 방안

### 우선순위 1: `fetchBootstrap(convId)` 캐싱 추가
```typescript
// ConversationGateway.ts
async fetchBootstrap(convId?: string): Promise<StudentChatBootstrap> {
  const result = await apiFetch<StudentChatBootstrap>(url, {
    method: "GET",
    accessToken: this.accessToken,
    cacheTtl: convId ? 10 * 1000 : 30 * 1000,  // ✅ 10초 캐싱
  });
  // ...
}
```

**효과**: 동일 대화 재진입 시 10초간 캐싱 → 호출 감소 90%

---

### 우선순위 2: 메시지 폴링 최적화
```typescript
// useMessagesQuery.ts
return useQuery({
  queryKey: messageKeys.list(convId),
  queryFn: async () => { /* ... */ },
  enabled: enabled && !!accessToken && !!convId,
  staleTime: 5 * 1000,  // ✅ 5초로 변경 (0초 → 5초)
  refetchOnWindowFocus: false,  // ✅ 비활성화 또는 debounce
  refetchInterval: 30 * 1000,  // ✅ 30초마다 자동 리페치
});
```

**효과**: 윈도우 포커스 중복 호출 제거 + 5초 캐싱

---

### 우선순위 3: InitialDataUseCase 이중 호출 제거
```typescript
// initialDataUseCase.ts
async execute(requester, convId?) {
  let data = await this.initialDataPort.fetchBootstrap(convId);

  if (!data.conversation && requester.role === "NEW_HIRE") {
    const createResult = await this.conversationUseCase.create({...});

    // ✅ 재호출 대신 데이터 조합
    data = {
      conversation: createResult.value,
      currentUser: data.currentUser,
      availableConversations: [createResult.value],
      // ...기존 Bootstrap 데이터 재사용
    };
  }
  // ...
}
```

**효과**: 신규 사용자 첫 방문 시 API 호출 2회 → 1회

---

### 우선순위 4: API 레벨 Rate Limit 디바운싱
```typescript
// lib/api.ts - 이미 구현됨! ✅
const pendingRequests = new Map<string, Promise<unknown>>();

// 동일 GET 요청이 진행 중이면 기존 Promise 재사용
if (isGet && pendingRequests.has(cacheKey)) {
  const result = await pendingRequests.get(cacheKey);
  return result as ApiResult<T>;
}
```

**현재 상태**: 이미 구현되어 있어 추가 작업 불필요 ✅

---

## 📈 예상 효과

### 개선 전 (최악 시나리오)
- **5분간 API 호출**: 약 40회
- **Rate Limit 도달 가능성**: 높음

### 개선 후
- **5분간 API 호출**: 약 8-12회 (70% 감소)
- **Rate Limit 도달 가능성**: 매우 낮음

---

## 🎨 좋은 패턴 (유지할 것)

### ✅ 1. 경량 API 분리
```typescript
// StudentDashboardGateway - 목록만 조회하는 경량 API
GET /api/entitle/conversations  // ✅ 가벼움

// 대신 무거운 Bootstrap API 사용 안 함
GET /api/entitle/student-chat  // ❌ 너무 무거움
```

### ✅ 2. 인메모리 캐싱 + 중복 요청 방지
```typescript
// lib/api.ts
const cache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();  // ✅ 우수한 패턴
```

### ✅ 3. React Query의 Optimistic Update
```typescript
// useMessagesQuery.ts - useSendMessage
onMutate: async (content: string) => {
  // ✅ 즉시 UI 업데이트 (서버 응답 기다리지 않음)
  const optimisticMessage: Message = {
    msgId: `temp-${Date.now()}`,
    // ...
  };
  queryClient.setQueryData(messageKeys.list(convId), [...previousMessages, optimisticMessage]);
}
```

### ✅ 4. 초기 로드 중복 방지
```typescript
// useStudentDashboardPresenter.ts
const hasLoadedInitial = useRef(false);  // ✅ 우수한 패턴

useEffect(() => {
  if (hasLoadedInitial.current) return;  // ✅ 중복 방지
  hasLoadedInitial.current = true;
  void loadConversations();
}, [studentId, loadConversations]);
```

---

## 🚨 추가 모니터링 필요 사항

### 1. 백엔드 로그 확인
```bash
# 어떤 엔드포인트에서 429가 발생하는지 확인
grep "429" /var/log/app.log | awk '{print $7}' | sort | uniq -c
```

### 2. Rate Limit 설정 확인
- 백엔드 Rate Limit: 몇 req/min?
- IP 기준? 사용자 기준?
- 특정 엔드포인트만 제한?

### 3. 프론트엔드 실제 호출 패턴 측정
```typescript
// lib/api.ts에 로깅 추가
console.log('[API]', method, url, 'cached:', !!cached);
```

---

## 📝 결론

### 주요 원인
1. **`fetchBootstrap(convId)` 캐싱 없음** → 동일 대화 재진입 시 중복 호출
2. **메시지 조회 `staleTime: 0`** → 윈도우 포커스 시마다 재조회
3. **InitialDataUseCase 이중 호출** → 신규 사용자 첫 방문 시 불필요한 재호출

### 우선 적용 사항
1. ✅ `fetchBootstrap(convId)` 캐싱 10초 추가
2. ✅ `useMessagesQuery` staleTime 5초 변경
3. ✅ `refetchOnWindowFocus` 비활성화

### 장기 개선 방향
- [ ] React Query를 모든 API 호출에 적용 (Presenter 대신)
- [ ] WebSocket 기반 실시간 메시지 수신 (폴링 대신)
- [ ] 백엔드 Rate Limit 완화 또는 사용자별 할당량 증가

---

**분석자**: Claude Code Quality Analyzer
**분석 일시**: 2025-12-19

# RAG Cache Implementation Guide

## Quick Start

This guide provides step-by-step implementation instructions for the multi-layer caching architecture.

---

## Phase 1: L1 Cache Enhancement (Week 1, Days 1-2)

### Step 1.1: Extend InMemoryCacheService

**File**: `src/llm/cache/inMemoryCacheService.ts`

#### 1.1.1 Add FileSearch Cache Map

```typescript
// ADD after existing cache maps (line ~69)

// 🆕 FileSearch完全一致キャッシュ
private readonly fileSearchExactCache = new Map<
  string,
  CacheEntry<FileSearchAnswerResult>
>();

// 🆕 セマンティックキャッシュへの参照（Phase 2で実装）
private semanticCacheService: SemanticCacheService | null = null;

// 🆕 永続キャッシュへの参照（Phase 3で実装）
private persistentCacheService: PersistentCacheService | null = null;
```

#### 1.1.2 Add FileSearch TTL Configuration

```typescript
// UPDATE TTL configuration (line ~75)

private readonly TTL = {
  SYSTEM_PROMPT: 60 * 60 * 1000,      // 1時間
  CONVERSATION: 30 * 60 * 1000,       // 30分
  WEB_SEARCH: 30 * 60 * 1000,         // 30分
  // 🆕 FileSearch TTL
  FILE_SEARCH: 30 * 60 * 1000,        // 30分（デフォルト）
  FILE_SEARCH_POPULAR: 2 * 60 * 60 * 1000, // 人気クエリは2時間
};

private readonly MAX_ENTRIES = {
  SYSTEM_PROMPT: 100,
  CONVERSATION: 50,
  WEB_SEARCH: 200,
  // 🆕 FileSearch制限
  FILE_SEARCH: 500, // 最大500クエリ
};
```

#### 1.1.3 Add FileSearch Cache Method

```typescript
// ADD new method after getOrCreateWebSearch() (line ~287)

/**
 * 🆕 FileSearch結果のキャッシュ取得/作成
 *
 * キャッシュ戦略:
 * 1. L1 (InMemory) - 完全一致チェック
 * 2. L2 (Semantic) - 類似クエリ検索（Phase 2で有効化）
 * 3. L3 (Firestore) - 永続ストレージ（Phase 3で有効化）
 * 4. FileSearch API - コールドスタート
 *
 * @param query ユーザークエリ
 * @param options FileSearchオプション
 * @param generator FileSearch API呼び出し関数
 * @returns キャッシュまたは新規生成結果
 */
async getOrCreateFileSearchAnswer(
  query: string,
  options: FileSearchAnswerOptions,
  generator: () => Promise<FileSearchAnswerResult>,
): Promise<FileSearchAnswerResult> {
  const startTime = Date.now();
  const cacheKey = this.generateFileSearchCacheKey(query, options);

  // ===== STEP 1: L1 (InMemory) 完全一致チェック =====
  const cached = this.fileSearchExactCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const latency = Date.now() - startTime;
    this.logger.debug(
      `FileSearch L1 cache HIT: key=${cacheKey}, latency=${latency}ms`,
    );
    return cached.value;
  }

  this.logger.debug(`FileSearch L1 cache MISS: key=${cacheKey}`);

  // ===== STEP 2: L2 (Semantic) 類似クエリ検索 =====
  // Phase 2で実装
  if (this.semanticCacheService) {
    try {
      const semanticResult = await this.semanticCacheService.findSimilar(
        query,
        options,
        0.92, // 類似度閾値
      );

      if (semanticResult) {
        const latency = Date.now() - startTime;
        this.logger.log(
          `FileSearch L2 semantic cache HIT: similarity=${semanticResult.similarity.toFixed(3)}, latency=${latency}ms`,
        );

        // L1にプロモート（Write-back）
        this.fileSearchExactCache.set(cacheKey, {
          value: semanticResult.result,
          expiresAt: Date.now() + this.TTL.FILE_SEARCH,
          createdAt: Date.now(),
        });

        return semanticResult.result;
      }
    } catch (error) {
      this.logger.warn('L2 semantic cache query failed, continuing to L3', error);
    }
  }

  // ===== STEP 3: L3 (Firestore) 永続ストレージ =====
  // Phase 3で実装
  if (this.persistentCacheService) {
    try {
      const l3Result = await this.persistentCacheService.find(query, options);

      if (l3Result) {
        const latency = Date.now() - startTime;
        this.logger.log(`FileSearch L3 cache HIT: latency=${latency}ms`);

        // L1にプロモート
        this.fileSearchExactCache.set(cacheKey, {
          value: l3Result,
          expiresAt: Date.now() + this.TTL.FILE_SEARCH,
          createdAt: Date.now(),
        });

        // L2にもプロモート（非同期、Phase 2で実装）
        if (this.semanticCacheService) {
          this.semanticCacheService.store(query, options, l3Result).catch(() => {});
        }

        return l3Result;
      }
    } catch (error) {
      this.logger.warn('L3 persistent cache query failed, falling back to API', error);
    }
  }

  // ===== STEP 4: Cache Miss - Mutex Lockで重複生成防止 =====
  const release = await this.mutex.acquire(cacheKey);

  try {
    // Double-check: ロック取得中に他のリクエストがキャッシュを埋めた可能性
    const rechecked = this.fileSearchExactCache.get(cacheKey);
    if (rechecked && rechecked.expiresAt > Date.now()) {
      this.logger.debug(`FileSearch cache HIT after lock: key=${cacheKey}`);
      return rechecked.value;
    }

    // 新規生成（FileSearch API呼び出し）
    this.logger.log(`FileSearch cache MISS, calling API: key=${cacheKey}`);
    const apiStartTime = Date.now();
    const result = await generator();
    const apiLatency = Date.now() - apiStartTime;

    this.logger.log(
      `FileSearch API completed: latency=${apiLatency}ms, answerLength=${result.answer.length}`,
    );

    // L1に保存
    this.fileSearchExactCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + this.TTL.FILE_SEARCH,
      createdAt: Date.now(),
    });

    // メモリ制限適用
    this.enforceMaxEntries(
      this.fileSearchExactCache,
      this.MAX_ENTRIES.FILE_SEARCH,
    );

    // L2, L3への非同期書き込み（Phase 2, 3で有効化）
    this.propagateToLowerLayers(query, options, result).catch((error) => {
      this.logger.warn('Failed to propagate cache to lower layers', error);
    });

    const totalLatency = Date.now() - startTime;
    this.logger.log(
      `FileSearch cached: key=${cacheKey}, totalLatency=${totalLatency}ms`,
    );

    return result;
  } finally {
    release();
  }
}

/**
 * 🆕 FileSearchキャッシュキー生成
 *
 * Key構成:
 * - query (正規化: trim + lowercase)
 * - conversationId
 * - systemInstructionHash (PersonalityPreset + MBTI)
 */
private generateFileSearchCacheKey(
  query: string,
  options: FileSearchAnswerOptions,
): string {
  const parts = [
    query.trim().toLowerCase(),
    options.conversationId?.toString() || 'none',
    this.hashString(options.systemInstruction || ''),
  ];

  return `filesearch:${this.hashString(parts.join('::'))}`;
}

/**
 * 🆕 下位キャッシュレイヤーへの非同期伝播
 */
private async propagateToLowerLayers(
  query: string,
  options: FileSearchAnswerOptions,
  result: FileSearchAnswerResult,
): Promise<void> {
  const promises: Promise<void>[] = [];

  // L2 (Semantic Cache) への保存
  if (this.semanticCacheService) {
    promises.push(
      this.semanticCacheService.store(query, options, result),
    );
  }

  // L3 (Firestore) への保存
  if (this.persistentCacheService) {
    promises.push(
      this.persistentCacheService.store(query, options, result),
    );
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}

/**
 * 🆕 FileSearchキャッシュ無効化
 */
invalidateFileSearchCache(cacheKey?: string): void {
  if (cacheKey) {
    const deleted = this.fileSearchExactCache.delete(cacheKey);
    if (deleted) {
      this.logger.log(`FileSearch cache invalidated: key=${cacheKey}`);
    }
  } else {
    // 全クリア
    const size = this.fileSearchExactCache.size;
    this.fileSearchExactCache.clear();
    this.logger.log(`FileSearch cache cleared: ${size} entries deleted`);
  }
}

/**
 * 🆕 セマンティックキャッシュサービス注入（Phase 2で使用）
 */
setSemanticCacheService(service: SemanticCacheService): void {
  this.semanticCacheService = service;
  this.logger.log('Semantic cache service injected');
}

/**
 * 🆕 永続キャッシュサービス注入（Phase 3で使用）
 */
setPersistentCacheService(service: PersistentCacheService): void {
  this.persistentCacheService = service;
  this.logger.log('Persistent cache service injected');
}
```

#### 1.1.4 Update Statistics Method

```typescript
// UPDATE getStats() method (line ~291)

/**
 * 全体キャッシュ統計
 */
getStats(): {
  systemPromptCount: number;
  conversationCount: number;
  webSearchCount: number;
  fileSearchCount: number; // 🆕
  totalEntries: number;
} {
  return {
    systemPromptCount: this.systemPromptCache.size,
    conversationCount: this.conversationCache.size,
    webSearchCount: this.webSearchCache.size,
    fileSearchCount: this.fileSearchExactCache.size, // 🆕
    totalEntries:
      this.systemPromptCache.size +
      this.conversationCache.size +
      this.webSearchCache.size +
      this.fileSearchExactCache.size, // 🆕
  };
}
```

---

### Step 1.2: Integrate with HybridRagAssistant

**File**: `src/llm/external/hybridRagAssistantV2.ts`

#### 1.2.1 Update tryFileSearch Method

```typescript
// UPDATE tryFileSearch method (line ~111)

/**
 * FileSearch試行（キャッシュ統合版）
 */
private async tryFileSearch(
  question: string,
  options: FileSearchAnswerOptions,
): Promise<HybridAnswerResult> {
  this.logger.log('Executing FileSearch with caching');

  try {
    // 🆕 InMemoryCacheServiceを通じてFileSearch結果を取得
    const result = await this.cacheService.getOrCreateFileSearchAnswer(
      question,
      options,
      async () => {
        // キャッシュミス時のみFileSearch API呼び出し
        return await this.withTimeout(
          this.ragAssistant.answerQuestion(question, options),
          TIMEOUT.FILE_SEARCH,
          'FileSearch timeout',
        );
      },
    );

    return {
      type: ResponseType.ANSWER,
      answer: result.answer,
      message: result.message,
      sources: result.sources,
    };
  } catch (error) {
    this.logger.error('FileSearch failed', error);

    // Fallback: 一般知識で回答
    const fallbackResult = await this.generalAssistant.answer(question, {
      conversationId: options.conversationId as string,
      history: options.history,
      systemInstruction: options.systemInstruction,
      cachedContentName: options.geminiCacheName,
    });

    return {
      type: ResponseType.ANSWER,
      answer: fallbackResult.answer,
      message: fallbackResult.message,
    };
  }
}
```

---

### Step 1.3: Test L1 Cache

#### 1.3.1 Create Test File

**File**: `src/llm/cache/inMemoryCacheService.spec.ts` (extend existing)

```typescript
// ADD new test cases

describe('InMemoryCacheService - FileSearch Cache', () => {
  let service: InMemoryCacheService;

  beforeEach(() => {
    service = new InMemoryCacheService();
  });

  it('should cache FileSearch results', async () => {
    const query = 'テストクエリ';
    const options: FileSearchAnswerOptions = {
      conversationId: createUUID(),
      systemInstruction: 'test instruction',
    };

    const mockResult: FileSearchAnswerResult = {
      answer: 'テスト回答',
      message: {
        messageId: createUUID(),
        conversationId: options.conversationId,
        userRole: 'ASSISTANT',
        content: 'テスト回答',
        createdAt: new Date(),
      },
    };

    let apiCallCount = 0;
    const generator = async () => {
      apiCallCount++;
      return mockResult;
    };

    // 初回: APIコール
    const result1 = await service.getOrCreateFileSearchAnswer(
      query,
      options,
      generator,
    );
    expect(apiCallCount).toBe(1);
    expect(result1.answer).toBe('テスト回答');

    // 2回目: キャッシュヒット（APIコールなし）
    const result2 = await service.getOrCreateFileSearchAnswer(
      query,
      options,
      generator,
    );
    expect(apiCallCount).toBe(1); // 増えない
    expect(result2.answer).toBe('テスト回答');
  });

  it('should handle cache stampede with mutex lock', async () => {
    const query = 'concurrent test';
    const options: FileSearchAnswerOptions = {
      conversationId: createUUID(),
    };

    const mockResult: FileSearchAnswerResult = {
      answer: 'concurrent answer',
      message: {} as any,
    };

    let apiCallCount = 0;
    const generator = async () => {
      apiCallCount++;
      // Simulate slow API call
      await new Promise((resolve) => setTimeout(resolve, 100));
      return mockResult;
    };

    // 5つの同時リクエスト
    const promises = Array(5)
      .fill(null)
      .map(() =>
        service.getOrCreateFileSearchAnswer(query, options, generator),
      );

    const results = await Promise.all(promises);

    // 1回のAPI呼び出しのみ（Cache Stampede防止）
    expect(apiCallCount).toBe(1);
    results.forEach((result) => {
      expect(result.answer).toBe('concurrent answer');
    });
  });

  it('should respect TTL and expire cache', async () => {
    // Mock Date.now() for TTL testing
    const originalNow = Date.now;
    let mockTime = Date.now();
    Date.now = jest.fn(() => mockTime);

    const query = 'ttl test';
    const options: FileSearchAnswerOptions = {
      conversationId: createUUID(),
    };

    const mockResult: FileSearchAnswerResult = {
      answer: 'ttl answer',
      message: {} as any,
    };

    let apiCallCount = 0;
    const generator = async () => {
      apiCallCount++;
      return mockResult;
    };

    // 初回キャッシュ
    await service.getOrCreateFileSearchAnswer(query, options, generator);
    expect(apiCallCount).toBe(1);

    // 29分後: まだ有効（TTL=30分）
    mockTime += 29 * 60 * 1000;
    await service.getOrCreateFileSearchAnswer(query, options, generator);
    expect(apiCallCount).toBe(1); // キャッシュヒット

    // 31分後: 期限切れ
    mockTime += 2 * 60 * 1000;
    await service.getOrCreateFileSearchAnswer(query, options, generator);
    expect(apiCallCount).toBe(2); // 再生成

    // Restore
    Date.now = originalNow;
  });
});
```

#### 1.3.2 Run Tests

```bash
# InMemoryCacheServiceのテスト実行
npm test -- inMemoryCacheService.spec.ts

# 期待結果:
# ✓ should cache FileSearch results
# ✓ should handle cache stampede with mutex lock
# ✓ should respect TTL and expire cache
```

---

## Phase 2: L2 Semantic Cache (Week 1-2, Days 3-7)

### Step 2.1: Setup Cloud Memorystore (Redis)

#### 2.1.1 Google Cloud Console Setup

```bash
# 1. Cloud Memorystore instance作成
gcloud redis instances create rag-cache \
  --size=4 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --tier=STANDARD_HA \
  --enable-redis-search

# 2. Instance情報取得
gcloud redis instances describe rag-cache --region=us-central1

# Output:
# host: 10.0.0.3
# port: 6379
# redisSearchEnabled: true
```

#### 2.1.2 Environment Variables

**File**: `.env`

```bash
# Redis (Cloud Memorystore)
REDIS_HOST=10.0.0.3
REDIS_PORT=6379
REDIS_PASSWORD=  # Cloud Memorystore doesn't use password by default
REDIS_TLS_ENABLED=false  # Within VPC, TLS is optional

# Google Embeddings
GOOGLE_API_KEY=your-api-key-here
TEXT_EMBEDDING_MODEL=text-embedding-005
```

---

### Step 2.2: Install Dependencies

```bash
# Redis client + RediSearch support
npm install ioredis
npm install @types/ioredis --save-dev

# Google AI embeddings (already installed)
# @google/genai: ^1.30.0
```

---

### Step 2.3: Create SemanticCacheService

**File**: `src/llm/cache/semanticCacheService.ts` (NEW)

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { GoogleGenerativeAI } from '@google/genai';
import type {
  FileSearchAnswerOptions,
  FileSearchAnswerResult,
} from '../external/fileSearchAssistant';

/**
 * Semantic Cache Service (Redis + RediSearch)
 *
 * 機能:
 * - クエリの意味的類似度に基づくキャッシュ検索
 * - RediSearch Vector Similarity (HNSW algorithm)
 * - Google text-embedding-005 (768次元)
 */
@Injectable()
export class SemanticCacheService implements OnModuleInit {
  private readonly logger = new Logger(SemanticCacheService.name);
  private readonly redis: Redis;
  private readonly ai: GoogleGenerativeAI;

  // Configuration
  private readonly SIMILARITY_THRESHOLD = 0.92;
  private readonly EMBEDDING_MODEL = 'text-embedding-005';
  private readonly CACHE_INDEX = 'filesearch:semantic:idx';
  private readonly CACHE_PREFIX = 'filesearch:semantic:';

  constructor() {
    // Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    // Google AI for embeddings
    this.ai = new GoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY!,
    });

    // Redis connection event handlers
    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });
  }

  async onModuleInit() {
    try {
      await this.redis.connect();
      await this.ensureSearchIndex();
      this.logger.log('Semantic cache service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize semantic cache service', error);
      throw error;
    }
  }

  /**
   * RediSearch Vector Index作成
   */
  private async ensureSearchIndex(): Promise<void> {
    try {
      // Check if index exists
      const info = await this.redis.call('FT.INFO', this.CACHE_INDEX);
      this.logger.debug('RediSearch index already exists');
      return;
    } catch (error) {
      // Index doesn't exist, create it
      this.logger.log('Creating RediSearch semantic index...');
    }

    try {
      await this.redis.call(
        'FT.CREATE',
        this.CACHE_INDEX,
        'ON',
        'JSON',
        'PREFIX',
        '1',
        this.CACHE_PREFIX,
        'SCHEMA',
        '$.query_embedding',
        'AS',
        'query_embedding',
        'VECTOR',
        'HNSW',
        '6',
        'TYPE',
        'FLOAT32',
        'DIM',
        '768',
        'DISTANCE_METRIC',
        'COSINE',
        '$.query_text',
        'AS',
        'query_text',
        'TEXT',
        '$.created_at',
        'AS',
        'created_at',
        'NUMERIC',
      );

      this.logger.log('RediSearch semantic index created successfully');
    } catch (error) {
      this.logger.error('Failed to create RediSearch index', error);
      throw error;
    }
  }

  /**
   * 🔍 類似クエリ検索
   */
  async findSimilar(
    query: string,
    options: FileSearchAnswerOptions,
    threshold: number = this.SIMILARITY_THRESHOLD,
  ): Promise<{ result: FileSearchAnswerResult; similarity: number } | null> {
    const startTime = Date.now();

    try {
      // 1. クエリをベクトル化
      const queryEmbedding = await this.embedQuery(query);

      // 2. RediSearch Vector Similarity Search
      const searchResults = (await this.redis.call(
        'FT.SEARCH',
        this.CACHE_INDEX,
        `*=>[KNN 5 @query_embedding $query_vec AS score]`,
        'PARAMS',
        '2',
        'query_vec',
        this.floatArrayToBuffer(queryEmbedding),
        'SORTBY',
        'score',
        'ASC',
        'RETURN',
        '3',
        'query_text',
        'result',
        'score',
        'DIALECT',
        '2',
      )) as any[];

      // 3. 結果パース
      if (!searchResults || searchResults[0] === 0) {
        const latency = Date.now() - startTime;
        this.logger.debug(
          `Semantic cache MISS: no similar queries, latency=${latency}ms`,
        );
        return null;
      }

      // searchResults format: [total, key1, [field1, value1, ...], ...]
      const totalResults = searchResults[0];
      if (totalResults === 0) {
        return null;
      }

      const firstResultFields = searchResults[2] as string[];
      const scoreIndex = firstResultFields.findIndex((f) => f === 'score');
      const resultIndex = firstResultFields.findIndex((f) => f === 'result');

      if (scoreIndex === -1 || resultIndex === -1) {
        return null;
      }

      const score = parseFloat(firstResultFields[scoreIndex + 1]);
      const similarity = 1 - score; // Cosine distance → similarity

      // 4. 閾値チェック
      if (similarity < threshold) {
        const latency = Date.now() - startTime;
        this.logger.debug(
          `Semantic cache MISS: similarity ${similarity.toFixed(3)} < threshold ${threshold}, latency=${latency}ms`,
        );
        return null;
      }

      // 5. キャッシュHIT
      const cachedResult = JSON.parse(
        firstResultFields[resultIndex + 1],
      ) as FileSearchAnswerResult;

      const latency = Date.now() - startTime;
      this.logger.log(
        `Semantic cache HIT: similarity=${similarity.toFixed(3)}, latency=${latency}ms`,
      );

      return { result: cachedResult, similarity };
    } catch (error) {
      this.logger.error('Semantic cache query failed', error);
      return null;
    }
  }

  /**
   * 💾 キャッシュ保存
   */
  async store(
    query: string,
    options: FileSearchAnswerOptions,
    result: FileSearchAnswerResult,
  ): Promise<void> {
    try {
      const queryEmbedding = await this.embedQuery(query);
      const key = `${this.CACHE_PREFIX}${this.hashString(query + Date.now())}`;

      const cacheEntry = {
        query_text: query,
        query_embedding: queryEmbedding,
        conversation_id: options.conversationId?.toString(),
        system_instruction_hash: this.hashString(
          options.systemInstruction || '',
        ),
        result: result,
        created_at: Date.now(),
      };

      // Redis JSON.SET
      await this.redis.call('JSON.SET', key, '$', JSON.stringify(cacheEntry));

      // TTL設定 (1時間)
      await this.redis.expire(key, 3600);

      this.logger.debug(`Stored semantic cache: ${key}`);
    } catch (error) {
      this.logger.error('Failed to store semantic cache', error);
      throw error;
    }
  }

  /**
   * 🔤 クエリベクトル化
   */
  private async embedQuery(query: string): Promise<number[]> {
    try {
      const response = await this.ai.models.embedContent({
        model: this.EMBEDDING_MODEL,
        content: query,
      });

      return response.embedding.values;
    } catch (error) {
      this.logger.error('Failed to embed query', error);
      throw error;
    }
  }

  /**
   * Float配列 → Buffer変換
   */
  private floatArrayToBuffer(arr: number[]): Buffer {
    const buffer = Buffer.allocUnsafe(arr.length * 4);
    arr.forEach((val, i) => buffer.writeFloatLE(val, i * 4));
    return buffer;
  }

  /**
   * 簡易ハッシュ関数
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 🗑️ パターンマッチによる削除
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys: string[] = [];
      let cursor = '0';

      // SCAN all keys matching pattern
      do {
        const [nextCursor, matchedKeys] = (await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        )) as [string, string[]];

        cursor = nextCursor;
        keys.push(...matchedKeys);
      } while (cursor !== '0');

      if (keys.length === 0) {
        return 0;
      }

      // Delete in batches
      const deleted = await this.redis.del(...keys);
      this.logger.log(`Deleted ${deleted} keys matching pattern: ${pattern}`);

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to delete pattern: ${pattern}`, error);
      throw error;
    }
  }

  /**
   * Module終了時のクリーンアップ
   */
  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }
}
```

---

### Step 2.4: Update Module Configuration

**File**: `src/llm/llm.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { InMemoryCacheService } from './cache/inMemoryCacheService';
import { GeminiCacheService } from './cache/geminiCacheService';
import { SemanticCacheService } from './cache/semanticCacheService'; // 🆕

@Module({
  providers: [
    // ... existing providers
    InMemoryCacheService,
    GeminiCacheService,
    SemanticCacheService, // 🆕
  ],
  exports: [
    InMemoryCacheService,
    GeminiCacheService,
    SemanticCacheService, // 🆕
  ],
})
export class LlmModule {}
```

---

### Step 2.5: Inject Semantic Cache into InMemory Cache

**File**: `src/llm/cache/inMemoryCacheService.ts`

```typescript
// UPDATE constructor

constructor(
  // 🆕 Semantic Cache Serviceを注入
  @Optional()
  private readonly semanticCache?: SemanticCacheService,
) {
  // 定期キャッシュクリーンアップ開始
  this.startCleanupInterval();

  // Semantic Cacheの参照を設定
  if (semanticCache) {
    this.semanticCacheService = semanticCache;
    this.logger.log('Semantic cache service injected into InMemoryCache');
  }
}
```

**Note**: `@Optional()` decorator allows InMemoryCache to work even if Semantic Cache is not available.

---

### Step 2.6: Test L2 Semantic Cache

**File**: `src/llm/cache/semanticCacheService.spec.ts` (NEW)

```typescript
import { Test } from '@nestjs/testing';
import { SemanticCacheService } from './semanticCacheService';
import { createUUID } from '../../common/uuid';
import type { FileSearchAnswerResult } from '../external/fileSearchAssistant';

describe('SemanticCacheService', () => {
  let service: SemanticCacheService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [SemanticCacheService],
    }).compile();

    service = module.get<SemanticCacheService>(SemanticCacheService);
    await service.onModuleInit();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('should store and retrieve semantically similar queries', async () => {
    const originalQuery = '新人研修のスケジュール';
    const similarQuery = '新入社員の研修予定';

    const mockResult: FileSearchAnswerResult = {
      answer: '研修は3月1日から開始されます。',
      message: {
        messageId: createUUID(),
        conversationId: createUUID(),
        userRole: 'ASSISTANT',
        content: '研修は3月1日から開始されます。',
        createdAt: new Date(),
      },
    };

    // Store original query
    await service.store(originalQuery, {} as any, mockResult);

    // Wait for indexing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Search with similar query
    const found = await service.findSimilar(similarQuery, {} as any, 0.90);

    expect(found).not.toBeNull();
    expect(found!.similarity).toBeGreaterThan(0.90);
    expect(found!.result.answer).toBe('研修は3月1日から開始されます。');
  }, 30000); // 30s timeout for API calls

  it('should not match dissimilar queries', async () => {
    const query1 = '新人研修のスケジュール';
    const query2 = '今日の天気はどうですか';

    const mockResult: FileSearchAnswerResult = {
      answer: 'テスト',
      message: {} as any,
    };

    await service.store(query1, {} as any, mockResult);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const found = await service.findSimilar(query2, {} as any, 0.92);

    expect(found).toBeNull(); // 類似度が低いため見つからない
  }, 30000);
});
```

```bash
# Test execution
npm test -- semanticCacheService.spec.ts
```

---

## Phase 3: L3 Persistent Cache (Week 3)

### Step 3.1: Setup Cloud Firestore

**File**: `src/llm/cache/persistentCacheService.ts` (NEW)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import type {
  FileSearchAnswerOptions,
  FileSearchAnswerResult,
} from '../external/fileSearchAssistant';

/**
 * Persistent Cache Service (Cloud Firestore)
 *
 * 機能:
 * - 長期保存（7-30日）
 * - アクセス分析
 * - 人気クエリ追跡
 */
@Injectable()
export class PersistentCacheService {
  private readonly logger = new Logger(PersistentCacheService.name);
  private readonly firestore: Firestore;

  private readonly CACHE_COLLECTION = 'filesearch_cache';
  private readonly ANALYTICS_COLLECTION = 'query_analytics';

  constructor() {
    this.firestore = new Firestore({
      projectId: process.env.GCP_PROJECT_ID,
    });
  }

  // ... (implementation from main architecture doc)
}
```

---

## Testing Strategy

### End-to-End Cache Flow Test

**File**: `test/cache-integration.e2e-spec.ts` (NEW)

```typescript
describe('Cache Integration (e2e)', () => {
  it('should follow L1 → L2 → L3 → API flow', async () => {
    // Test implementation
  });
});
```

---

## Monitoring & Metrics

### CloudWatch Dashboard Template

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["CacheMetrics", "l1_hit_rate"],
          [".", "l2_hit_rate"],
          [".", "l3_hit_rate"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-central1",
        "title": "Cache Hit Rates"
      }
    }
  ]
}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Redis instance created and accessible
- [ ] Firestore collections created
- [ ] Feature flags configured

### Deployment

- [ ] Deploy with L1 only (feature flag)
- [ ] Monitor for 24 hours
- [ ] Enable L2 (semantic cache)
- [ ] Monitor for 48 hours
- [ ] Enable L3 (persistent cache)
- [ ] Full monitoring for 7 days

### Post-Deployment

- [ ] Verify cache hit rate >90%
- [ ] Verify average response time <5s
- [ ] Check for errors/warnings
- [ ] Analyze cost savings

---

**Document Version**: 1.0
**Last Updated**: 2025-12-19
**Author**: System Architecture Designer

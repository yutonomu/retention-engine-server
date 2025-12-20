# RAG/FileSearch Caching Architecture Design

## Executive Summary

**目標**: Gemini FileSearch応答時間を20秒 → 5秒以下に短縮
**現状**: NestJS + Gemini FileSearch + InMemoryCache
**戦略**: 多層キャッシング + セマンティック類似度 + Google Cloud優先

---

## 1. Current System Analysis

### 1.1 現在のアーキテクチャ

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                      NestJS Backend                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │           LlmService (llm.service.ts)              │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │   InMemoryCacheService (L1 Cache)        │     │    │
│  │  │   - System Prompts (TTL: 1h)             │     │    │
│  │  │   - Conversations (TTL: 30min)           │     │    │
│  │  │   - Web Search (TTL: 30min)              │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │   GeminiCacheService (API-Level Cache)   │     │    │
│  │  │   - Context Caching (TTL: 1h)            │     │    │
│  │  │   - Token Cost Reduction (75-90%)        │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │      HybridRagAssistant (hybridRagAssistantV2.ts)  │    │
│  │  ┌─────────────┐  ┌──────────────┐               │    │
│  │  │ FileSearch  │  │ WebSearch    │               │    │
│  │  │  (20s avg)  │  │  (cached)    │               │    │
│  │  └─────────────┘  └──────────────┘               │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Gemini     │  │   Gemini     │  │   Google     │     │
│  │  FileSearch  │  │     API      │  │    Search    │     │
│  │  (20s avg)   │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 現在のパフォーマンスボトルネック

| コンポーネント | 平均レイテンシ | ボトルネック |
|--------------|-------------|------------|
| **Gemini FileSearch API** | 15-20秒 | ・ドキュメント検索処理<br>・ベクトル類似度計算<br>・チャンク抽出 |
| **InMemoryCache (L1)** | <1ms | ・プロセス内揮発性<br>・再起動時消失<br>・単一インスタンスのみ |
| **GeminiCache (API-Level)** | 200-500ms | ・システムプロンプトのみ<br>・FileSearch結果は非対応 |
| **Web Search Enhancement** | 5-10秒 | ・キャッシュ済み（30分TTL） |

**Critical Issue**: FileSearch APIの呼び出しは**キャッシュ不可能**と考えられていたが、実際には**クエリ＋コンテキストベース**のキャッシングが可能。

---

## 2. Proposed Multi-Layer Caching Architecture

### 2.1 全体アーキテクチャ (Target: <5s Response)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Request                             │
│              "新人研修のスケジュールを教えて"                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NestJS Backend (Enhanced)                        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              L1: InMemory Cache (Node.js)                    │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│  │
│  │  │ Exact Match    │  │ System Prompts │  │ Conversations  ││  │
│  │  │ TTL: 30min     │  │ TTL: 1h        │  │ TTL: 30min     ││  │
│  │  │ <1ms latency   │  │                │  │                ││  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘│  │
│  └─────────────────────────────────────────────────────────────┘  │
│                             │ MISS                                  │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │         L2: Cloud Memorystore (Redis) - Semantic Cache       │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │  Semantic Similarity Search (Vector Embeddings)        │ │  │
│  │  │  - Query Embedding (text-embedding-005)                │ │  │
│  │  │  - Cosine Similarity Threshold: 0.92                   │ │  │
│  │  │  - TTL: 1-24h (adaptive based on content type)         │ │  │
│  │  │  - Latency: 5-10ms                                     │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                             │ MISS                                  │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              L3: Cloud Firestore (Persistent)                │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │  Long-term Storage & Analytics                         │ │  │
│  │  │  - Historical Query-Answer Pairs                       │ │  │
│  │  │  - Popular Queries Cache (Pre-warming)                 │ │  │
│  │  │  - TTL: 7-30 days                                      │ │  │
│  │  │  - Latency: 50-100ms                                   │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                             │ MISS                                  │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │          Gemini FileSearch API (Original Source)             │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │  - Execute FileSearch Query (15-20s)                   │ │  │
│  │  │  - Store result in L3 → L2 → L1 (write-through)        │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │            Cache Warming & Analytics Service                 │  │
│  │  - Pre-populate popular queries                             │  │
│  │  - Background refresh of expiring cache                     │  │
│  │  - Query pattern analysis                                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Expected Performance Improvements

| Cache Layer | Hit Rate (予測) | Latency | Cost Reduction |
|------------|----------------|---------|----------------|
| **L1 (InMemory)** | 15-25% | <1ms | 99.9% |
| **L2 (Redis Semantic)** | 40-60% | 5-10ms | 99.5% |
| **L3 (Firestore)** | 10-15% | 50-100ms | 99% |
| **Cold (FileSearch API)** | 5-10% | 15-20s | 0% |
| **Overall Improvement** | **90-95% cache hit** | **<100ms avg** | **~95% cost reduction** |

**Target Achievement**:
- Current: 20s average → **Target: <5s (95%+ cases)**
- 90-95%のリクエストが**100ms以下**で応答

---

## 3. Detailed Component Design

### 3.1 L1 Cache: Enhanced InMemoryCache

#### 3.1.1 Current Implementation (inMemoryCacheService.ts)

```typescript
// 現状: システムプロンプト、会話、Web検索のみ
private readonly systemPromptCache = new Map<string, CacheEntry<string>>();
private readonly conversationCache = new Map<string, CacheEntry<unknown[]>>();
private readonly webSearchCache = new Map<string, CacheEntry<unknown>>();
```

#### 3.1.2 Enhanced Design

```typescript
// 拡張: FileSearch結果の完全一致キャッシュ追加
export class EnhancedInMemoryCacheService {
  // 既存キャッシュ
  private readonly systemPromptCache = new Map<string, CacheEntry<string>>();
  private readonly conversationCache = new Map<string, CacheEntry<Message[]>>();
  private readonly webSearchCache = new Map<string, CacheEntry<WebSearchResult>>();

  // 🆕 FileSearch完全一致キャッシュ
  private readonly fileSearchExactCache = new Map<string, CacheEntry<FileSearchResult>>();

  // 🆕 セマンティックキャッシュへのフォールバック参照
  private semanticCacheService: SemanticCacheService | null = null;

  // 🆕 キャッシュ統計（分析用）
  private stats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    avgLatency: 0,
  };

  /**
   * 🆕 FileSearch結果のキャッシュ取得/作成
   * L1 → L2 (Semantic) → L3 (Firestore) → FileSearch API
   */
  async getOrCreateFileSearchAnswer(
    query: string,
    options: FileSearchAnswerOptions,
    generator: () => Promise<FileSearchAnswerResult>,
  ): Promise<FileSearchAnswerResult> {
    const cacheKey = this.generateFileSearchCacheKey(query, options);

    // L1: 完全一致チェック
    const cached = this.fileSearchExactCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.stats.l1Hits++;
      this.logger.debug(`L1 cache HIT: ${cacheKey}`);
      return cached.value;
    }

    this.stats.l1Misses++;

    // L2: セマンティックキャッシュにフォールバック
    if (this.semanticCacheService) {
      const semanticResult = await this.semanticCacheService.findSimilar(
        query,
        options,
        0.92, // 類似度閾値
      );

      if (semanticResult) {
        this.stats.l2Hits++;
        this.logger.debug(`L2 semantic cache HIT: similarity=${semanticResult.similarity}`);

        // L1にプロモート（write-back）
        this.fileSearchExactCache.set(cacheKey, {
          value: semanticResult.result,
          expiresAt: Date.now() + this.TTL.FILE_SEARCH,
          createdAt: Date.now(),
        });

        return semanticResult.result;
      }
    }

    this.stats.l2Misses++;

    // Cache Miss: 新規生成
    const release = await this.mutex.acquire(cacheKey);
    try {
      // Double-check
      const rechecked = this.fileSearchExactCache.get(cacheKey);
      if (rechecked && rechecked.expiresAt > Date.now()) {
        return rechecked.value;
      }

      const result = await generator();

      // L1に保存
      this.fileSearchExactCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + this.TTL.FILE_SEARCH,
        createdAt: Date.now(),
      });

      // L2 (Semantic), L3 (Firestore) への書き込みは非同期で実行
      this.propagateToLowerLayers(query, options, result).catch((error) => {
        this.logger.warn('Failed to propagate to lower cache layers', error);
      });

      return result;
    } finally {
      release();
    }
  }

  /**
   * 🆕 FileSearchキャッシュキー生成
   * query + conversationId + systemInstructionHash
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
    // L2 (Redis): セマンティックキャッシュに保存
    if (this.semanticCacheService) {
      await this.semanticCacheService.store(query, options, result);
    }

    // L3 (Firestore): 永続化（バックグラウンド）
    // 実装は次セクション参照
  }

  /**
   * 🆕 TTL設定（コンテンツタイプ別）
   */
  private readonly TTL = {
    SYSTEM_PROMPT: 60 * 60 * 1000,      // 1時間
    CONVERSATION: 30 * 60 * 1000,       // 30分
    WEB_SEARCH: 30 * 60 * 1000,         // 30分
    FILE_SEARCH: 30 * 60 * 1000,        // 🆕 30分（調整可能）
    FILE_SEARCH_POPULAR: 2 * 60 * 60 * 1000, // 🆕 頻繁クエリは2時間
  };

  /**
   * 🆕 キャッシュ統計取得（モニタリング用）
   */
  getDetailedStats() {
    const hitRate = this.stats.l1Hits / (this.stats.l1Hits + this.stats.l1Misses) || 0;

    return {
      l1: {
        hits: this.stats.l1Hits,
        misses: this.stats.l1Misses,
        hitRate: hitRate.toFixed(3),
        size: this.fileSearchExactCache.size,
      },
      l2: {
        hits: this.stats.l2Hits,
        misses: this.stats.l2Misses,
        hitRate: (this.stats.l2Hits / this.stats.l2Misses || 0).toFixed(3),
      },
      avgLatency: this.stats.avgLatency,
    };
  }
}
```

**Key Features**:
- ✅ 完全一致キャッシュ（<1ms）
- ✅ L2セマンティックキャッシュへのフォールバック
- ✅ Write-through/Write-back戦略
- ✅ Mutex Lockによる同時リクエスト防止
- ✅ 統計収集（ヒット率、レイテンシ）

---

### 3.2 L2 Cache: Redis (Cloud Memorystore) - Semantic Cache

#### 3.2.1 Why Redis?

| Feature | Redis (Cloud Memorystore) | Alternatives |
|---------|--------------------------|--------------|
| **Latency** | 1-5ms (sub-ms) | Firestore: 50-100ms |
| **Semantic Search** | ✅ RediSearch + Vector Similarity | ⚠️ Limited |
| **Google Cloud Native** | ✅ Fully Managed | - |
| **Scalability** | ✅ High Availability | - |
| **Cost** | $$ (Medium) | Firestore: $ (Low) |
| **Vector Support** | ✅ HNSW Algorithm | ❌ (Firestore needs workaround) |

**Decision**: Redis (Cloud Memorystore) with **RediSearch** module for semantic vector search.

#### 3.2.2 Architecture

```typescript
/**
 * Semantic Cache Service (Redis + RediSearch)
 *
 * クエリの意味的類似度に基づいてキャッシュ検索
 * Example:
 *   - "新人研修のスケジュール" → "新入社員の研修予定"（類似度: 0.95）
 *   - "福利厚生について" → "社員の福利厚生制度"（類似度: 0.93）
 */
@Injectable()
export class SemanticCacheService {
  private readonly redis: Redis;
  private readonly embeddings: GoogleGenerativeAI; // text-embedding-005
  private readonly logger = new Logger(SemanticCacheService.name);

  // セマンティックキャッシュ設定
  private readonly SIMILARITY_THRESHOLD = 0.92; // 類似度閾値
  private readonly EMBEDDING_MODEL = 'text-embedding-005'; // 768次元
  private readonly CACHE_INDEX = 'filesearch:semantic:idx';

  constructor() {
    // Cloud Memorystore (Redis) 接続
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.NODE_ENV === 'production' ? {} : undefined,
    });

    this.embeddings = new GoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY!,
    });

    // RediSearch インデックス作成
    this.ensureSearchIndex();
  }

  /**
   * RediSearch Vector Index作成
   *
   * Index Schema:
   * - query_embedding: VECTOR (HNSW, 768 dims, Cosine)
   * - query_text: TEXT
   * - result: JSON (FileSearchAnswerResult)
   * - created_at: NUMERIC
   * - ttl: NUMERIC
   */
  private async ensureSearchIndex(): Promise<void> {
    try {
      await this.redis.call(
        'FT.CREATE',
        this.CACHE_INDEX,
        'ON', 'JSON',
        'PREFIX', '1', 'filesearch:semantic:',
        'SCHEMA',
        '$.query_embedding', 'AS', 'query_embedding',
        'VECTOR', 'HNSW', '6',
        'TYPE', 'FLOAT32',
        'DIM', '768',
        'DISTANCE_METRIC', 'COSINE',
        '$.query_text', 'AS', 'query_text', 'TEXT',
        '$.created_at', 'AS', 'created_at', 'NUMERIC',
      );

      this.logger.log('RediSearch semantic index created');
    } catch (error) {
      if (error.message.includes('Index already exists')) {
        this.logger.debug('RediSearch index already exists');
      } else {
        throw error;
      }
    }
  }

  /**
   * 🔍 類似クエリ検索
   *
   * @param query ユーザークエリ
   * @param options FileSearch options
   * @param threshold 類似度閾値 (0.0-1.0)
   * @returns 類似キャッシュエントリまたはnull
   */
  async findSimilar(
    query: string,
    options: FileSearchAnswerOptions,
    threshold: number = this.SIMILARITY_THRESHOLD,
  ): Promise<{ result: FileSearchAnswerResult; similarity: number } | null> {
    const startTime = Date.now();

    // 1. クエリをベクトル化
    const queryEmbedding = await this.embedQuery(query);

    // 2. RediSearch Vector Similarity Search
    // KNN (K-Nearest Neighbors) 検索: Top 5候補を取得
    const searchResults = await this.redis.call(
      'FT.SEARCH',
      this.CACHE_INDEX,
      `*=>[KNN 5 @query_embedding $query_vec AS score]`,
      'PARAMS', '2', 'query_vec', this.floatArrayToBuffer(queryEmbedding),
      'SORTBY', 'score', 'ASC',
      'RETURN', '3', 'query_text', 'result', 'score',
      'DIALECT', '2',
    ) as any[];

    // 3. 結果パース
    if (!searchResults || searchResults[0] === 0) {
      this.logger.debug(`Semantic cache MISS: no similar queries found`);
      return null;
    }

    // searchResults format: [total, key1, [field1, value1, field2, value2, ...], key2, [...]]
    const totalResults = searchResults[0];
    if (totalResults === 0) {
      return null;
    }

    // 最初の結果を取得
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
      this.logger.debug(
        `Semantic cache MISS: similarity ${similarity.toFixed(3)} < threshold ${threshold}`,
      );
      return null;
    }

    // 5. キャッシュHIT
    const cachedResult = JSON.parse(firstResultFields[resultIndex + 1]) as FileSearchAnswerResult;

    const latency = Date.now() - startTime;
    this.logger.log(
      `Semantic cache HIT: similarity=${similarity.toFixed(3)}, latency=${latency}ms`,
    );

    return { result: cachedResult, similarity };
  }

  /**
   * 💾 キャッシュ保存
   */
  async store(
    query: string,
    options: FileSearchAnswerOptions,
    result: FileSearchAnswerResult,
  ): Promise<void> {
    const queryEmbedding = await this.embedQuery(query);
    const key = `filesearch:semantic:${this.hashString(query + Date.now())}`;

    const cacheEntry = {
      query_text: query,
      query_embedding: queryEmbedding,
      conversation_id: options.conversationId?.toString(),
      system_instruction_hash: this.hashString(options.systemInstruction || ''),
      result: result,
      created_at: Date.now(),
    };

    // Redis JSON.SET
    await this.redis.call('JSON.SET', key, '$', JSON.stringify(cacheEntry));

    // TTL設定 (1時間)
    await this.redis.expire(key, 3600);

    this.logger.debug(`Stored semantic cache: ${key}`);
  }

  /**
   * 🔤 クエリベクトル化
   * Google text-embedding-005 (768次元)
   */
  private async embedQuery(query: string): Promise<number[]> {
    try {
      const response = await this.embeddings.models.embedContent({
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
   * Float配列 → Buffer変換（RediSearch Vector用）
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
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
```

**Key Features**:
- ✅ **RediSearch Vector Similarity**: HNSW algorithm (高速近似最近傍探索)
- ✅ **Semantic Matching**: 意味的に類似したクエリをマッチング
- ✅ **Configurable Threshold**: 類似度閾値調整可能（0.92推奨）
- ✅ **Google Embeddings**: text-embedding-005 (768次元)
- ✅ **Sub-10ms Latency**: Redis in-memory performance

#### 3.2.3 Example Semantic Matching

| Original Query | Similar Cached Query | Similarity | Hit? |
|---------------|---------------------|-----------|------|
| "新人研修のスケジュール" | "新入社員の研修予定" | 0.95 | ✅ HIT |
| "福利厚生について" | "社員の福利厚生制度" | 0.93 | ✅ HIT |
| "有給休暇の取り方" | "年次有給休暇の申請方法" | 0.94 | ✅ HIT |
| "今日の天気" | "新人研修のスケジュール" | 0.21 | ❌ MISS |

---

### 3.3 L3 Cache: Cloud Firestore (Persistent Storage)

#### 3.3.1 Why Firestore?

| Feature | Firestore | Alternatives |
|---------|-----------|--------------|
| **Google Cloud Native** | ✅ | - |
| **Serverless** | ✅ No管理 | Cloud SQL: 要管理 |
| **Scalability** | ✅ Auto-scaling | - |
| **Query Performance** | 50-100ms | Redis: 1-5ms |
| **Cost** | $ (Low) | Redis: $$ |
| **Use Case** | Long-term storage, Analytics | Hot cache |

**Decision**: Firestore for **cold storage** and **query analytics**.

#### 3.3.2 Architecture

```typescript
/**
 * Persistent Cache Service (Cloud Firestore)
 *
 * 長期保存、分析、キャッシュウォーミング
 */
@Injectable()
export class PersistentCacheService {
  private readonly firestore: Firestore;
  private readonly logger = new Logger(PersistentCacheService.name);

  // Collections
  private readonly CACHE_COLLECTION = 'filesearch_cache';
  private readonly ANALYTICS_COLLECTION = 'query_analytics';

  constructor() {
    this.firestore = new Firestore({
      projectId: process.env.GCP_PROJECT_ID,
    });
  }

  /**
   * 🔍 キャッシュ検索
   */
  async find(
    query: string,
    options: FileSearchAnswerOptions,
  ): Promise<FileSearchAnswerResult | null> {
    const cacheKey = this.generateCacheKey(query, options);

    const docRef = this.firestore
      .collection(this.CACHE_COLLECTION)
      .doc(cacheKey);

    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;

    // TTLチェック
    const expiresAt = data.expiresAt?.toMillis();
    if (expiresAt && expiresAt < Date.now()) {
      // 期限切れ: 削除
      await docRef.delete();
      return null;
    }

    this.logger.log(`L3 cache HIT: ${cacheKey}`);

    // アクセス統計更新（非同期）
    this.updateAccessStats(cacheKey).catch(() => {});

    return data.result as FileSearchAnswerResult;
  }

  /**
   * 💾 キャッシュ保存
   */
  async store(
    query: string,
    options: FileSearchAnswerOptions,
    result: FileSearchAnswerResult,
    ttl: number = 7 * 24 * 60 * 60 * 1000, // デフォルト7日
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(query, options);

    const docRef = this.firestore
      .collection(this.CACHE_COLLECTION)
      .doc(cacheKey);

    await docRef.set({
      query,
      conversationId: options.conversationId?.toString(),
      systemInstructionHash: this.hashString(options.systemInstruction || ''),
      result,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + ttl),
      accessCount: 0,
      lastAccessedAt: null,
    });

    this.logger.debug(`Stored L3 cache: ${cacheKey}`);
  }

  /**
   * 📊 アクセス統計更新
   */
  private async updateAccessStats(cacheKey: string): Promise<void> {
    const docRef = this.firestore
      .collection(this.CACHE_COLLECTION)
      .doc(cacheKey);

    await docRef.update({
      accessCount: FieldValue.increment(1),
      lastAccessedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * 📈 人気クエリ取得（キャッシュウォーミング用）
   */
  async getPopularQueries(limit: number = 100): Promise<string[]> {
    const snapshot = await this.firestore
      .collection(this.CACHE_COLLECTION)
      .orderBy('accessCount', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data().query as string);
  }

  /**
   * 🧹 期限切れキャッシュ削除
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const snapshot = await this.firestore
      .collection(this.CACHE_COLLECTION)
      .where('expiresAt', '<', now)
      .limit(500)
      .get();

    const batch = this.firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    this.logger.log(`Cleaned up ${snapshot.size} expired cache entries`);
    return snapshot.size;
  }

  private generateCacheKey(query: string, options: FileSearchAnswerOptions): string {
    const parts = [
      query.trim().toLowerCase(),
      options.conversationId?.toString() || 'none',
      this.hashString(options.systemInstruction || ''),
    ];

    return this.hashString(parts.join('::'));
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
```

**Key Features**:
- ✅ **Long-term Storage**: 7-30日間の永続化
- ✅ **Access Analytics**: アクセス頻度追跡
- ✅ **Popular Queries**: キャッシュウォーミング用
- ✅ **Auto Cleanup**: 期限切れ自動削除

---

## 4. Cache Key Design & Invalidation Strategy

### 4.1 Cache Key Structure

```
Cache Key Components:
┌─────────────────────────────────────────────────────────────┐
│  hash(query + conversationId + systemInstructionHash)       │
└─────────────────────────────────────────────────────────────┘
      │              │                    │
      ▼              ▼                    ▼
   Query Text   Conversation ID    System Instruction
                                   (PersonalityPreset + MBTI)
```

**Example**:
```typescript
// Input
query = "新人研修のスケジュールを教えて"
conversationId = "uuid-1234"
systemInstruction = "FILE_SEARCH_INSTRUCTION + PersonalityPreset(friendly) + MBTI(ENFP)"

// Cache Key
cacheKey = hash("新人研修のスケジュールを教えて::uuid-1234::hash(systemInstruction)")
// Output: "filesearch:a3f9b2c1d4e5"
```

### 4.2 Cache Invalidation Strategy

#### 4.2.1 Invalidation Triggers

| Trigger | Action | Affected Layers |
|---------|--------|----------------|
| **Document Upload** | Invalidate all FileSearch cache | L1, L2, L3 |
| **User Settings Change** | Invalidate user-specific cache | L1 (system prompt) |
| **PersonalityPreset Update** | Invalidate preset-dependent cache | L1 (system prompt) |
| **Manual Invalidation** | Clear specific query cache | L1, L2, L3 |

#### 4.2.2 Implementation

```typescript
/**
 * Cache Invalidation Service
 */
@Injectable()
export class CacheInvalidationService {
  constructor(
    private readonly l1Cache: EnhancedInMemoryCacheService,
    private readonly l2Cache: SemanticCacheService,
    private readonly l3Cache: PersistentCacheService,
  ) {}

  /**
   * ドキュメントアップロード時: 全FileSearchキャッシュ無効化
   */
  async invalidateOnDocumentUpload(): Promise<void> {
    this.logger.warn('Invalidating all FileSearch cache due to document upload');

    // L1: 完全クリア
    await this.l1Cache.clearFileSearchCache();

    // L2: Redis pattern delete
    await this.l2Cache.deletePattern('filesearch:semantic:*');

    // L3: Firestore batch delete (非同期)
    this.l3Cache.clearAll().catch((error) => {
      this.logger.error('Failed to clear L3 cache', error);
    });
  }

  /**
   * ユーザー設定変更時: ユーザー固有キャッシュ無効化
   */
  async invalidateUserCache(userId: string): Promise<void> {
    this.logger.log(`Invalidating cache for userId=${userId}`);

    // L1: システムプロンプトキャッシュのみ
    await this.l1Cache.invalidateSystemPrompt(userId);

    // L2, L3: 会話IDベースで削除（該当ユーザーの全会話）
    // Implementation depends on tracking user-conversation mapping
  }

  /**
   * 手動無効化: 特定クエリ
   */
  async invalidateQuery(query: string, options: FileSearchAnswerOptions): Promise<void> {
    const cacheKey = this.generateCacheKey(query, options);

    await this.l1Cache.delete(cacheKey);
    await this.l2Cache.delete(cacheKey);
    await this.l3Cache.delete(cacheKey);
  }
}
```

### 4.3 TTL (Time-To-Live) Policy

#### Adaptive TTL based on Content Type

```typescript
enum CacheContentType {
  STATIC_DOCUMENT = 'static',    // 静的ドキュメント（会社規則など）
  DYNAMIC_INFO = 'dynamic',       // 動的情報（イベントスケジュールなど）
  POPULAR_QUERY = 'popular',      // 人気クエリ
  RARE_QUERY = 'rare',            // レアクエリ
}

const TTL_POLICY: Record<CacheContentType, number> = {
  [CacheContentType.STATIC_DOCUMENT]: 24 * 60 * 60 * 1000,  // 24時間
  [CacheContentType.DYNAMIC_INFO]: 1 * 60 * 60 * 1000,      // 1時間
  [CacheContentType.POPULAR_QUERY]: 4 * 60 * 60 * 1000,     // 4時間
  [CacheContentType.RARE_QUERY]: 30 * 60 * 1000,            // 30分
};

/**
 * Adaptive TTL determination
 */
function determineTTL(
  query: string,
  result: FileSearchAnswerResult,
  accessCount: number,
): number {
  // Rule 1: 頻繁アクセスクエリ → 長いTTL
  if (accessCount > 50) {
    return TTL_POLICY[CacheContentType.POPULAR_QUERY];
  }

  // Rule 2: 静的ドキュメント（会社規則、ポリシーなど）→ 最長TTL
  const staticKeywords = ['規則', 'ポリシー', '就業規則', '福利厚生'];
  if (staticKeywords.some((kw) => query.includes(kw))) {
    return TTL_POLICY[CacheContentType.STATIC_DOCUMENT];
  }

  // Rule 3: 動的情報（スケジュール、イベントなど）→ 短いTTL
  const dynamicKeywords = ['スケジュール', 'イベント', '予定', '最新'];
  if (dynamicKeywords.some((kw) => query.includes(kw))) {
    return TTL_POLICY[CacheContentType.DYNAMIC_INFO];
  }

  // Default: レアクエリ
  return TTL_POLICY[CacheContentType.RARE_QUERY];
}
```

---

## 5. Cache Warming & Background Refresh

### 5.1 Cache Warming Strategy

```typescript
/**
 * Cache Warming Service
 *
 * アプリケーション起動時およびアイドル時に、
 * 人気クエリを事前にキャッシュ
 */
@Injectable()
export class CacheWarmingService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmingService.name);

  constructor(
    private readonly persistentCache: PersistentCacheService,
    private readonly l1Cache: EnhancedInMemoryCacheService,
    private readonly l2Cache: SemanticCacheService,
    private readonly fileSearchAssistant: FileSearchAssistant,
  ) {}

  async onModuleInit() {
    // 起動時にキャッシュウォーミング開始（非同期）
    this.warmupCache().catch((error) => {
      this.logger.error('Cache warmup failed', error);
    });

    // 定期的にリフレッシュ（毎時）
    setInterval(() => {
      this.refreshExpiring().catch(() => {});
    }, 60 * 60 * 1000);
  }

  /**
   * 起動時キャッシュウォーミング
   */
  private async warmupCache(): Promise<void> {
    this.logger.log('Starting cache warmup...');

    // L3から人気クエリTop 100を取得
    const popularQueries = await this.persistentCache.getPopularQueries(100);

    this.logger.log(`Warming up ${popularQueries.length} popular queries`);

    // 並列プリロード（最大10並列）
    const chunks = this.chunkArray(popularQueries, 10);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (query) => {
          try {
            // L3から取得 → L2, L1にプロモート
            const result = await this.persistentCache.find(query, {
              conversationId: createUUID(), // ダミーID
            } as any);

            if (result) {
              // L2に保存
              await this.l2Cache.store(query, {} as any, result);
              // L1は実際のリクエスト時に自動プロモート
            }
          } catch (error) {
            this.logger.warn(`Failed to warm up query: ${query}`, error);
          }
        }),
      );
    }

    this.logger.log('Cache warmup completed');
  }

  /**
   * 期限切れ間近キャッシュのバックグラウンドリフレッシュ
   */
  private async refreshExpiring(): Promise<void> {
    this.logger.debug('Refreshing expiring cache entries...');

    // L2から期限切れ間近（残り5分以下）のエントリを取得
    const expiringKeys = await this.l2Cache.getExpiringKeys(5 * 60 * 1000);

    if (expiringKeys.length === 0) {
      return;
    }

    this.logger.log(`Refreshing ${expiringKeys.length} expiring cache entries`);

    // バックグラウンドで再生成
    for (const key of expiringKeys) {
      try {
        const cacheData = await this.l2Cache.get(key);
        if (!cacheData) continue;

        // FileSearch APIで再生成
        const refreshedResult = await this.fileSearchAssistant.answerQuestion(
          cacheData.query,
          cacheData.options,
        );

        // 全層に再保存
        await this.l1Cache.store(key, refreshedResult);
        await this.l2Cache.store(cacheData.query, cacheData.options, refreshedResult);
        await this.persistentCache.store(cacheData.query, cacheData.options, refreshedResult);

        this.logger.debug(`Refreshed cache: ${key}`);
      } catch (error) {
        this.logger.warn(`Failed to refresh cache: ${key}`, error);
      }
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

**Benefits**:
- ✅ **Cold Start Mitigation**: 起動後すぐに高速応答
- ✅ **Proactive Refresh**: 期限切れ前に再生成
- ✅ **Background Processing**: ユーザー体験に影響なし

---

## 6. Implementation Plan & Milestones

### 6.1 Phase 1: Foundation (Week 1-2)

**Goal**: L1拡張 + L2 Redis基盤構築

| Task | Description | Priority | Estimate |
|------|-------------|----------|----------|
| **1.1 L1 Cache Enhancement** | InMemoryCacheServiceにFileSearchキャッシュ追加 | 🔴 HIGH | 2 days |
| **1.2 Redis Setup** | Cloud Memorystore + RediSearch module | 🔴 HIGH | 1 day |
| **1.3 Embedding Service** | Google text-embedding-005統合 | 🔴 HIGH | 1 day |
| **1.4 Basic Semantic Cache** | SemanticCacheService基本実装 | 🔴 HIGH | 3 days |
| **1.5 Integration Testing** | L1↔L2連携テスト | 🟡 MEDIUM | 2 days |

**Deliverables**:
- ✅ L1 + L2動作確認
- ✅ セマンティック検索デモ
- ✅ パフォーマンステスト（<10ms latency）

### 6.2 Phase 2: Persistence & Analytics (Week 3)

**Goal**: L3 Firestore + 分析基盤

| Task | Description | Priority | Estimate |
|------|-------------|----------|----------|
| **2.1 Firestore Setup** | Cloud Firestore collections設計 | 🟡 MEDIUM | 1 day |
| **2.2 Persistent Cache Service** | PersistentCacheService実装 | 🟡 MEDIUM | 2 days |
| **2.3 Analytics Dashboard** | クエリ分析、ヒット率可視化 | 🟢 LOW | 2 days |
| **2.4 L3 Integration** | L1↔L2↔L3連携 | 🟡 MEDIUM | 2 days |

**Deliverables**:
- ✅ 3層キャッシュ完全動作
- ✅ 分析ダッシュボード

### 6.3 Phase 3: Optimization & Production (Week 4)

**Goal**: キャッシュウォーミング + 本番最適化

| Task | Description | Priority | Estimate |
|------|-------------|----------|----------|
| **3.1 Cache Warming** | CacheWarmingService実装 | 🔴 HIGH | 2 days |
| **3.2 Invalidation Logic** | CacheInvalidationService実装 | 🔴 HIGH | 1 day |
| **3.3 Monitoring** | CloudWatch/Logging/Metrics | 🟡 MEDIUM | 2 days |
| **3.4 Load Testing** | 本番負荷テスト（1000 req/min） | 🔴 HIGH | 2 days |
| **3.5 Production Deployment** | 段階的ロールアウト | 🔴 HIGH | 1 day |

**Deliverables**:
- ✅ 本番環境デプロイ
- ✅ 目標達成確認（<5s応答、90%+キャッシュヒット）

---

## 7. Cost Analysis

### 7.1 Infrastructure Costs (Monthly)

| Component | Specification | Monthly Cost (USD) |
|-----------|--------------|-------------------|
| **Cloud Memorystore (Redis)** | M1 (4GB) + RediSearch | $150 - $200 |
| **Cloud Firestore** | 10M reads/month | $10 - $20 |
| **Text Embedding API** | 1M queries/month | $20 - $40 |
| **Cloud Monitoring** | Logs + Metrics | $10 - $20 |
| **Total** | - | **$190 - $280** |

### 7.2 Cost Savings (Gemini FileSearch API)

**Current**:
- Gemini FileSearch API calls: 10,000 requests/month
- Average cost per request: $0.05
- **Total: $500/month**

**With Caching (95% hit rate)**:
- Cold requests: 500/month (5%)
- Cost: 500 × $0.05 = **$25/month**

**Net Savings**: $500 - $25 - $280 (infrastructure) = **$195/month (~39% reduction)**

**Additional Benefits**:
- ⚡ **User Experience**: 20s → <1s (95% cases)
- 🎯 **Latency SLA**: 99th percentile <5s
- 📊 **Analytics**: Query pattern insights

---

## 8. Monitoring & Observability

### 8.1 Key Metrics

```typescript
/**
 * Cache Metrics Service
 */
@Injectable()
export class CacheMetricsService {
  private readonly metrics = {
    // Hit Rates
    l1HitRate: new Counter('cache_l1_hit_rate'),
    l2HitRate: new Counter('cache_l2_hit_rate'),
    l3HitRate: new Counter('cache_l3_hit_rate'),

    // Latencies
    l1Latency: new Histogram('cache_l1_latency_ms'),
    l2Latency: new Histogram('cache_l2_latency_ms'),
    l3Latency: new Histogram('cache_l3_latency_ms'),
    fileSearchLatency: new Histogram('filesearch_api_latency_ms'),

    // Throughput
    requestsPerMinute: new Gauge('cache_requests_per_minute'),

    // Semantic Similarity
    semanticSimilarityScore: new Histogram('semantic_similarity_score'),
  };

  /**
   * メトリクス記録
   */
  recordCacheAccess(layer: 'l1' | 'l2' | 'l3', hit: boolean, latency: number) {
    const hitRateMetric = this.metrics[`${layer}HitRate`];
    const latencyMetric = this.metrics[`${layer}Latency`];

    hitRateMetric.inc({ hit: hit ? 'true' : 'false' });
    latencyMetric.observe(latency);
  }

  /**
   * CloudWatch Dashboardへのエクスポート
   */
  async exportToCloudWatch() {
    // Implementation using AWS SDK
  }
}
```

### 8.2 CloudWatch Dashboard

```
┌────────────────────────────────────────────────────────────────┐
│                  RAG Cache Performance Dashboard                │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cache Hit Rates (Last 24h)                                     │
│  ┌───────────────────────────────────────────────────────────┐│
│  │  L1: ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 85%                                   ││
│  │  L2: ▓▓▓▓▓▓▓▓▓▓ 60%                                         ││
│  │  L3: ▓▓▓ 15%                                                ││
│  │  Overall: ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 95%                            ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                  │
│  Average Response Time (p50/p95/p99)                            │
│  ┌───────────────────────────────────────────────────────────┐│
│  │  Cached:     2ms / 8ms / 15ms                              ││
│  │  Cold Start: 18s / 22s / 25s                               ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                  │
│  Top 10 Popular Queries                                         │
│  ┌───────────────────────────────────────────────────────────┐│
│  │  1. 新人研修のスケジュール (458 hits)                         ││
│  │  2. 福利厚生について (312 hits)                             ││
│  │  3. 有給休暇の取り方 (289 hits)                             ││
│  └───────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Considerations

### 9.1 Cache Data Privacy

| Layer | Security Measure | Implementation |
|-------|------------------|----------------|
| **L1 (InMemory)** | Process isolation | ✅ Default (NestJS single instance) |
| **L2 (Redis)** | Encryption at rest + TLS | ✅ Cloud Memorystore (Google-managed) |
| **L3 (Firestore)** | IAM + Encryption | ✅ Firestore Security Rules |
| **Embeddings** | No PII in vectors | ⚠️ Review query content |

### 9.2 Cache Poisoning Prevention

```typescript
/**
 * Cache Validation Service
 *
 * キャッシュ汚染攻撃防止
 */
@Injectable()
export class CacheValidationService {
  /**
   * キャッシュエントリ検証
   */
  validateCacheEntry(result: FileSearchAnswerResult): boolean {
    // 1. スキーマ検証
    if (!result.answer || !result.message) {
      return false;
    }

    // 2. コンテンツ検証（悪意あるコンテンツ検出）
    const suspiciousPatterns = [
      /<script>/i,
      /javascript:/i,
      /onerror=/i,
    ];

    if (suspiciousPatterns.some((pattern) => pattern.test(result.answer))) {
      this.logger.warn('Suspicious content detected in cache entry');
      return false;
    }

    // 3. ソース検証
    if (result.sources?.fileSearch) {
      for (const source of result.sources.fileSearch) {
        if (!source.fileName || !source.chunks) {
          return false;
        }
      }
    }

    return true;
  }
}
```

---

## 10. Rollback Plan

### 10.1 Feature Flags

```typescript
/**
 * キャッシュ機能のフラグ制御
 */
export const CACHE_FEATURE_FLAGS = {
  ENABLE_L1_FILE_SEARCH: process.env.ENABLE_L1_FILE_SEARCH !== 'false',
  ENABLE_L2_SEMANTIC: process.env.ENABLE_L2_SEMANTIC !== 'false',
  ENABLE_L3_PERSISTENT: process.env.ENABLE_L3_PERSISTENT !== 'false',
  ENABLE_CACHE_WARMING: process.env.ENABLE_CACHE_WARMING !== 'false',
};

/**
 * 段階的ロールアウト
 */
@Injectable()
export class AdaptiveCacheService {
  async getFileSearchAnswer(
    query: string,
    options: FileSearchAnswerOptions,
  ): Promise<FileSearchAnswerResult> {
    // L1有効チェック
    if (CACHE_FEATURE_FLAGS.ENABLE_L1_FILE_SEARCH) {
      const l1Result = await this.l1Cache.get(query, options);
      if (l1Result) return l1Result;
    }

    // L2有効チェック
    if (CACHE_FEATURE_FLAGS.ENABLE_L2_SEMANTIC) {
      const l2Result = await this.l2Cache.findSimilar(query, options);
      if (l2Result) return l2Result.result;
    }

    // L3有効チェック
    if (CACHE_FEATURE_FLAGS.ENABLE_L3_PERSISTENT) {
      const l3Result = await this.l3Cache.find(query, options);
      if (l3Result) return l3Result;
    }

    // Fallback: FileSearch API
    return await this.fileSearchAssistant.answerQuestion(query, options);
  }
}
```

### 10.2 Rollback Procedure

```bash
# 緊急時の段階的無効化

# Step 1: L2 (Semantic Cache) 無効化
export ENABLE_L2_SEMANTIC=false
# アプリ再起動

# Step 2: L1 (InMemory) 無効化
export ENABLE_L1_FILE_SEARCH=false
# アプリ再起動

# Step 3: 完全ロールバック
git revert <commit-hash>
# デプロイ
```

---

## 11. Conclusion

### 11.1 Expected Outcomes

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| **Average Response Time** | 20s | <1s (95% cases) | **95% reduction** |
| **P99 Latency** | 25s | <5s | **80% reduction** |
| **Cache Hit Rate** | 0% | 90-95% | **∞ improvement** |
| **API Cost** | $500/month | $25/month | **95% reduction** |
| **User Satisfaction** | Low | High | ⭐⭐⭐⭐⭐ |

### 11.2 Success Criteria

✅ **Must-Have**:
- [ ] 90%以上のリクエストが5秒以内に応答
- [ ] キャッシュヒット率90%以上
- [ ] セマンティック検索精度（類似度0.92以上）

🎯 **Nice-to-Have**:
- [ ] 分析ダッシュボード（人気クエリ可視化）
- [ ] 自動キャッシュウォーミング
- [ ] A/Bテスト基盤

### 11.3 Next Steps

1. **Week 1-2**: Phase 1実装（L1 + L2）
2. **Week 3**: Phase 2実装（L3 + Analytics）
3. **Week 4**: Phase 3実装（Warming + Production）
4. **Week 5**: モニタリング + 最適化

---

**Document Version**: 1.0
**Last Updated**: 2025-12-19
**Author**: System Architecture Designer
**Review Status**: Draft

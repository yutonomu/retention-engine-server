import { Injectable, Logger } from '@nestjs/common';

/**
 * キャッシュエントリタイプ
 */
type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

/**
 * Mutex Lock for Cache Stampede Prevention
 */
class MutexLock {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    // 既存のロックがあれば待機
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // 新しいロックを作成
    let release: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.locks.set(key, lockPromise);

    return () => {
      this.locks.delete(key);
      release!();
    };
  }

  isLocked(key: string): boolean {
    return this.locks.has(key);
  }
}

/**
 * InMemoryCacheService (インメモリキャッシング)
 *
 * システムプロンプトと会話履歴をサーバーメモリにキャッシュ
 * - TTLベース自動期限切れ
 * - Cache Stampede防止 (Mutex Lock)
 * - メモリベースキャッシュ (プロセス内、揮発性)
 *
 * キャッシング対象:
 * - システムプロンプト: FILE_SEARCH_INSTRUCTION + PersonalityPreset + MBTI (TTL: 1時間)
 * - 会話履歴: Supabaseから取得したメッセージリスト (TTL: 30分)
 *
 * 効果:
 * - DBクエリ回数削減 (Supabase呼び出し最小化)
 * - サーバー再起動時キャッシュ消失 (揮発性)
 *
 * NOTE: このキャッシングはAPIトークンコスト削減とは無関係。
 *       トークンコスト削減はGeminiCacheServiceが担当。
 */
@Injectable()
export class InMemoryCacheService {
  private readonly logger = new Logger(InMemoryCacheService.name);

  // キャッシュストレージ
  private readonly systemPromptCache = new Map<string, CacheEntry<string>>();
  private readonly conversationCache = new Map<string, CacheEntry<unknown[]>>();

  // Mutex Lock
  private readonly mutex = new MutexLock();

  // TTL設定 (ミリ秒)
  private readonly TTL = {
    SYSTEM_PROMPT: 60 * 60 * 1000, // 1時間
    CONVERSATION: 30 * 60 * 1000, // 30分
  };

  // キャッシュクリーンアップ周期 (5分ごと)
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 定期キャッシュクリーンアップ開始
    this.startCleanupInterval();
  }

  /**
   * システムプロンプトキャッシュ取得/作成
   * Cache Stampede防止のためのMutex Lock適用
   */
  async getOrCreateSystemPrompt(
    userId: string,
    generator: () => Promise<string>,
  ): Promise<string> {
    const cacheKey = `system_prompt:${userId}`;

    // キャッシュヒット確認
    const cached = this.systemPromptCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`System prompt cache HIT for userId=${userId}`);
      return cached.value;
    }

    // キャッシュミス - Mutex Lockで重複生成防止
    const release = await this.mutex.acquire(cacheKey);

    try {
      // Double-check: ロック取得中に他のリクエストがキャッシュを埋めた可能性
      const rechecked = this.systemPromptCache.get(cacheKey);
      if (rechecked && rechecked.expiresAt > Date.now()) {
        this.logger.debug(`System prompt cache HIT after lock for userId=${userId}`);
        return rechecked.value;
      }

      // 新規生成
      this.logger.log(`System prompt cache MISS for userId=${userId}, generating...`);
      const value = await generator();

      // キャッシュに保存
      this.systemPromptCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + this.TTL.SYSTEM_PROMPT,
        createdAt: Date.now(),
      });

      this.logger.log(`System prompt cached for userId=${userId}, TTL=${this.TTL.SYSTEM_PROMPT}ms`);
      return value;
    } finally {
      release();
    }
  }

  /**
   * 会話履歴キャッシュ取得/作成
   */
  async getOrCreateConversation<T>(
    conversationId: string,
    generator: () => Promise<T[]>,
  ): Promise<T[]> {
    const cacheKey = `conversation:${conversationId}`;

    // キャッシュヒット確認
    const cached = this.conversationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Conversation cache HIT for conversationId=${conversationId}`);
      return cached.value as T[];
    }

    // キャッシュミス - Mutex Lock
    const release = await this.mutex.acquire(cacheKey);

    try {
      // Double-check
      const rechecked = this.conversationCache.get(cacheKey);
      if (rechecked && rechecked.expiresAt > Date.now()) {
        this.logger.debug(`Conversation cache HIT after lock for conversationId=${conversationId}`);
        return rechecked.value as T[];
      }

      // 新規生成
      this.logger.log(`Conversation cache MISS for conversationId=${conversationId}, loading...`);
      const value = await generator();

      // キャッシュに保存
      this.conversationCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + this.TTL.CONVERSATION,
        createdAt: Date.now(),
      });

      this.logger.log(
        `Conversation cached for conversationId=${conversationId}, count=${value.length}, TTL=${this.TTL.CONVERSATION}ms`,
      );
      return value;
    } finally {
      release();
    }
  }

  /**
   * 会話履歴にメッセージ追加 (キャッシュ更新)
   */
  appendToConversation<T>(conversationId: string, message: T): void {
    const cacheKey = `conversation:${conversationId}`;
    const cached = this.conversationCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      cached.value.push(message);
      // TTL延長
      cached.expiresAt = Date.now() + this.TTL.CONVERSATION;
      this.logger.debug(`Message appended to conversation cache: conversationId=${conversationId}`);
    }
  }

  /**
   * システムプロンプトキャッシュ無効化
   * (ユーザー設定変更時に呼び出し)
   */
  invalidateSystemPrompt(userId: string): void {
    const cacheKey = `system_prompt:${userId}`;
    const deleted = this.systemPromptCache.delete(cacheKey);
    if (deleted) {
      this.logger.log(`System prompt cache invalidated for userId=${userId}`);
    }
  }

  /**
   * 会話キャッシュ無効化
   */
  invalidateConversation(conversationId: string): void {
    const cacheKey = `conversation:${conversationId}`;
    const deleted = this.conversationCache.delete(cacheKey);
    if (deleted) {
      this.logger.log(`Conversation cache invalidated for conversationId=${conversationId}`);
    }
  }

  /**
   * 全体キャッシュ統計
   */
  getStats(): {
    systemPromptCount: number;
    conversationCount: number;
    totalEntries: number;
  } {
    return {
      systemPromptCount: this.systemPromptCache.size,
      conversationCount: this.conversationCache.size,
      totalEntries: this.systemPromptCache.size + this.conversationCache.size,
    };
  }

  /**
   * 期限切れキャッシュクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // システムプロンプトキャッシュクリーンアップ
    for (const [key, entry] of this.systemPromptCache.entries()) {
      if (entry.expiresAt <= now) {
        this.systemPromptCache.delete(key);
        cleanedCount++;
      }
    }

    // 会話キャッシュクリーンアップ
    for (const [key, entry] of this.conversationCache.entries()) {
      if (entry.expiresAt <= now) {
        this.conversationCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cache cleanup: removed ${cleanedCount} expired entries`);
    }
  }

  /**
   * 定期クリーンアップ開始
   */
  private startCleanupInterval(): void {
    // 5分ごとにクリーンアップ
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);

    this.logger.log('Cache cleanup interval started (every 5 minutes)');
  }

  /**
   * サービス終了時クリーンアップ
   */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('Cache cleanup interval stopped');
    }
  }
}

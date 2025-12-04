import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, type CachedContent } from '@google/genai';

/**
 * キャッシュメタデータ (ローカル追跡用)
 */
type CacheMetadata = {
  cacheName: string; // Gemini APIから返されたキャッシュ名
  userId: string;
  systemPromptHash: string;
  expiresAt: number;
  createdAt: number;
  tokenCount?: number;
};

/**
 * Gemini Context Caching Service
 *
 * Gemini APIのContext Caching機能を使用してトークンコスト削減
 * - システムプロンプトをGeminiサーバーにキャッシング
 * - 最大75-90%入力トークンコスト削減（モデルにより異なる）
 *
 * 対応モデル最小トークン要件:
 * - Gemini 2.5 Flash: 1,024 tokens
 * - Gemini 2.5 Pro: 4,096 tokens
 *
 * TODO: 現在システムプロンプト(FILE_SEARCH_INSTRUCTION + PersonalityPreset + MBTI)が
 *       約471トークンで最小要件(1,024)に未達のためGemini APIキャッシングが無効状態。
 *       解決策:
 *       1. 会話履歴もキャッシング対象に含める（会話が蓄積すると自動有効化）
 *       2. システムプロンプト拡張（より詳細な指示を追加）
 *       3. 現状維持（コスト対効果を考慮、会話が十分長くなった時のみキャッシング）
 */
@Injectable()
export class GeminiCacheService {
  private readonly logger = new Logger(GeminiCacheService.name);
  private readonly ai: GoogleGenAI;

  // ローカルキャッシュメタデータ（キャッシュ名追跡用）
  private readonly cacheRegistry = new Map<string, CacheMetadata>();

  // TTL設定
  private readonly DEFAULT_TTL = '3600s'; // 1時間

  // 最小トークン要件（モデル別）
  private readonly MIN_TOKENS: Record<string, number> = {
    'gemini-2.5-flash': 1024,
    'gemini-2.5-pro': 4096,
    'gemini-2.0-flash': 1024,
    'gemini-1.5-flash': 32768,
    'gemini-1.5-pro': 32768,
  };

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for GeminiCacheService');
    }
    this.ai = new GoogleGenAI({ apiKey });

    // 定期的に期限切れキャッシュをクリーンアップ
    this.startCleanupInterval();
  }

  /**
   * システムプロンプトキャッシュ作成または取得
   *
   * @param userId ユーザーID
   * @param systemPrompt システムプロンプト
   * @param model 使用するモデル（デフォルト: gemini-2.0-flash）
   * @returns キャッシュ名（generateContentで使用）
   */
  async getOrCreateSystemPromptCache(
    userId: string,
    systemPrompt: string,
    model: string = 'gemini-2.0-flash',
  ): Promise<string | null> {
    const promptHash = this.hashString(systemPrompt);
    const cacheKey = `system_prompt:${userId}:${promptHash}`;

    // ローカルレジストリで確認
    const existing = this.cacheRegistry.get(cacheKey);
    if (existing && existing.expiresAt > Date.now()) {
      this.logger.debug(`Gemini cache HIT for userId=${userId}`);
      return existing.cacheName;
    }

    // トークン数確認（最小要件）
    const minTokens = this.MIN_TOKENS[model] || 1024;
    const estimatedTokens = this.estimateTokens(systemPrompt);

    if (estimatedTokens < minTokens) {
      this.logger.debug(
        `System prompt too short for caching: ${estimatedTokens} tokens < ${minTokens} required`,
      );
      return null; // キャッシングしない
    }

    // Gemini APIにキャッシュ作成
    try {
      this.logger.log(`Creating Gemini cache for userId=${userId}, model=${model}`);

      const cache = await this.ai.caches.create({
        model,
        config: {
          displayName: `system_prompt_${userId}_${Date.now()}`,
          systemInstruction: {
            role: 'user',
            parts: [{ text: systemPrompt }],
          },
          ttl: this.DEFAULT_TTL,
        },
      });

      if (!cache.name) {
        this.logger.warn('Cache creation returned no name');
        return null;
      }

      // ローカルレジストリに保存
      const expiresAt = this.parseExpireTime(cache.expireTime);
      this.cacheRegistry.set(cacheKey, {
        cacheName: cache.name,
        userId,
        systemPromptHash: promptHash,
        expiresAt,
        createdAt: Date.now(),
        tokenCount: cache.usageMetadata?.totalTokenCount,
      });

      this.logger.log(
        `Gemini cache created: name=${cache.name}, tokens=${cache.usageMetadata?.totalTokenCount}, expiresAt=${new Date(expiresAt).toISOString()}`,
      );

      return cache.name;
    } catch (error) {
      this.logger.error('Failed to create Gemini cache', error);
      return null;
    }
  }

  /**
   * キャッシュ削除
   */
  async deleteCache(cacheName: string): Promise<void> {
    try {
      await this.ai.caches.delete({ name: cacheName });
      this.logger.log(`Gemini cache deleted: ${cacheName}`);

      // ローカルレジストリからも削除
      for (const [key, meta] of this.cacheRegistry.entries()) {
        if (meta.cacheName === cacheName) {
          this.cacheRegistry.delete(key);
          break;
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to delete cache ${cacheName}`, error);
    }
  }

  /**
   * ユーザーの全キャッシュ無効化
   */
  async invalidateUserCaches(userId: string): Promise<void> {
    const toDelete: string[] = [];

    for (const [key, meta] of this.cacheRegistry.entries()) {
      if (meta.userId === userId) {
        toDelete.push(meta.cacheName);
        this.cacheRegistry.delete(key);
      }
    }

    // Gemini APIから削除
    for (const cacheName of toDelete) {
      await this.deleteCache(cacheName);
    }

    this.logger.log(`Invalidated ${toDelete.length} caches for userId=${userId}`);
  }

  /**
   * キャッシュ統計
   */
  getStats(): {
    totalCaches: number;
    activeCaches: number;
    expiredCaches: number;
  } {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const meta of this.cacheRegistry.values()) {
      if (meta.expiresAt > now) {
        active++;
      } else {
        expired++;
      }
    }

    return {
      totalCaches: this.cacheRegistry.size,
      activeCaches: active,
      expiredCaches: expired,
    };
  }

  /**
   * トークン数推定（簡単なヒューリスティック）
   * 実際にはGeminiのcountTokens APIを使用するのが正確
   */
  private estimateTokens(text: string): number {
    // 大体4文字 = 1トークン（英語基準）
    // 日本語/韓国語は文字あたりより多くのトークンを使用するため2文字 = 1トークンで計算
    const hasAsianChars = /[\u3000-\u9fff\uac00-\ud7af]/.test(text);
    const charsPerToken = hasAsianChars ? 2 : 4;
    return Math.ceil(text.length / charsPerToken);
  }

  /**
   * 文字列ハッシュ（簡易版）
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

  /**
   * 有効期限パース
   */
  private parseExpireTime(expireTime?: string): number {
    if (!expireTime) {
      return Date.now() + 3600000; // デフォルト1時間
    }
    return new Date(expireTime).getTime();
  }

  /**
   * 期限切れキャッシュクリーンアップ
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, meta] of this.cacheRegistry.entries()) {
      if (meta.expiresAt <= now) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cacheRegistry.delete(key);
    }

    if (toDelete.length > 0) {
      this.logger.log(`Cleaned up ${toDelete.length} expired cache entries`);
    }
  }

  /**
   * 定期クリーンアップ開始
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000); // 10分ごと

    this.logger.log('Gemini cache cleanup interval started (every 10 minutes)');
  }
}

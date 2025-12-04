import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { Message } from '../../Entity/Message';

export type WebSource = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResult = {
  answer: string;
  sources: WebSource[];
  confidence: number;
};

// Rate Limiter設定
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MIN_INTERVAL_MS: 1000, // 最小1秒間隔
};

// Retry設定
const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
};

/**
 * シンプルなRate Limiter
 */
class SimpleRateLimiter {
  private lastRequestTime = 0;
  private requestCount = 0;
  private windowStart = Date.now();

  async acquire(): Promise<void> {
    const now = Date.now();

    // ウィンドウリセット（1分経過時）
    if (now - this.windowStart > 60000) {
      this.windowStart = now;
      this.requestCount = 0;
    }

    // Rate limitチェック
    if (this.requestCount >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - (now - this.windowStart);
      await this.delay(waitTime);
      this.windowStart = Date.now();
      this.requestCount = 0;
    }

    // 最小間隔チェック
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT.MIN_INTERVAL_MS) {
      await this.delay(RATE_LIMIT.MIN_INTERVAL_MS - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

@Injectable()
export class WebSearchAssistant {
  private readonly ai: GoogleGenAI;
  private readonly logger = new Logger(WebSearchAssistant.name);
  private readonly rateLimiter = new SimpleRateLimiter();

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for WebSearchAssistant');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Google Searchを利用したWeb検索および回答生成
   * Rate LimitingおよびRetry with Exponential Backoff適用
   */
  async search(
    question: string,
    options: {
      history?: Message[];
      systemInstruction?: string;
    } = {},
  ): Promise<WebSearchResult> {
    // Rate limiting適用
    await this.rateLimiter.acquire();

    return this.searchWithRetry(question, options, RETRY.MAX_ATTEMPTS);
  }

  /**
   * Retry with Exponential Backoff
   */
  private async searchWithRetry(
    question: string,
    options: { history?: Message[]; systemInstruction?: string },
    remainingAttempts: number,
  ): Promise<WebSearchResult> {
    try {
      return await this._executeSearch(question, options);
    } catch (error) {
      const isRetryable = this.isRetryableError(error);

      if (!isRetryable || remainingAttempts <= 1) {
        this.logger.error(
          `Web search failed after ${RETRY.MAX_ATTEMPTS - remainingAttempts + 1} attempts`,
          error,
        );
        throw error;
      }

      const attempt = RETRY.MAX_ATTEMPTS - remainingAttempts + 1;
      const delayMs = Math.min(
        RETRY.BASE_DELAY_MS * Math.pow(2, attempt - 1),
        RETRY.MAX_DELAY_MS,
      );

      this.logger.warn(
        `Web search attempt ${attempt} failed, retrying in ${delayMs}ms...`,
      );
      await this.delay(delayMs);

      return this.searchWithRetry(question, options, remainingAttempts - 1);
    }
  }

  /**
   * 実際の検索実行
   */
  private async _executeSearch(
    question: string,
    options: { history?: Message[]; systemInstruction?: string },
  ): Promise<WebSearchResult> {
    this.logger.log(
      `Executing web search for: "${question.substring(0, 50)}..."`,
    );

    const systemPrompt =
      options.systemInstruction ||
      `
あなたはWeb検索専門のアシスタントです。
必ずGoogle検索を実行して、最新の情報を取得してから回答してください。

【重要】
- 必ずWeb検索を実行し、その結果に基づいて回答してください
- 自分の知識だけで回答せず、必ず検索結果を参照してください
- 検索結果の出典URLを必ず含めてください
- 最新の情報を優先してください
`.trim();

    // 검색에 최적화된 질문 형식으로 변환
    const searchQuery = `以下の質問についてWeb検索を実行し、最新の情報を取得して回答してください。

質問: ${question}

【指示】
- 必ずGoogle検索を使用して最新情報を取得してください
- 検索結果のURLや出典を含めてください
- 2024年以降の最新情報を優先してください`;

    const contents = [
      {
        role: 'user' as const,
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'user' as const,
        parts: [{ text: searchQuery }],
      },
    ];

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const answer = this.extractText(response);
    const sources = this.extractWebSources(response);
    const confidence = this.calculateConfidence(answer, sources);

    this.logger.log(
      `Web search completed: sources=${sources.length} confidence=${confidence.toFixed(2)}`,
    );

    return { answer, sources, confidence };
  }

  /**
   * リトライ可能なエラーか確認
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Rate limit, timeout, 一時的サーバーエラー
      return (
        message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('temporarily')
      );
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * レスポンスからテキスト抽出
   * 複数のpartsがある場合は全て結合する
   */
  private extractText(response: unknown): string {
    const resp = response as {
      text?: () => string;
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    if (typeof resp?.text === 'function') {
      return resp.text();
    }

    const textParts: string[] = [];
    const candidates = resp?.candidates || [];

    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part?.text) {
          textParts.push(part.text);
        }
      }
    }

    return textParts.join('');
  }

  /**
   * レスポンスからWebソース抽出
   */
  private extractWebSources(response: unknown): WebSource[] {
    const sources: WebSource[] = [];
    const resp = response as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{
            web?: {
              title?: string;
              uri?: string;
              snippet?: string;
            };
          }>;
        };
      }>;
    };

    const candidates = resp?.candidates || [];

    for (const candidate of candidates) {
      const groundingMetadata = candidate?.groundingMetadata;
      if (!groundingMetadata) continue;

      const chunks = groundingMetadata.groundingChunks || [];

      for (const chunk of chunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || 'Untitled',
            url: chunk.web.uri || '',
            snippet: chunk.web.snippet || '',
          });
        }
      }
    }

    // 重複除去（URL基準）
    const uniqueSources = sources.filter(
      (source, index, self) =>
        index === self.findIndex((s) => s.url === source.url),
    );

    return uniqueSources;
  }

  /**
   * Web検索信頼度計算
   */
  private calculateConfidence(answer: string, sources: WebSource[]): number {
    // ソース数ベース
    let confidence = Math.min(sources.length * 0.2, 0.6);

    // 回答長さベース
    if (answer.length > 200) confidence += 0.1;
    if (answer.length > 500) confidence += 0.1;

    // "検索結果がありません"等の否定的表現確認
    if (
      answer.includes('見つかりませんでした') ||
      answer.includes('情報がありません')
    ) {
      confidence = Math.min(confidence, 0.3);
    }

    return Math.min(confidence, 1.0);
  }
}

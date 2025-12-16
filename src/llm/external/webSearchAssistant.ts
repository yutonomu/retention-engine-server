import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { Message } from '../../Entity/Message';

export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
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

    // シンプルな指示でWeb検索を強制
    const searchPrompt = `
以下についてGoogle検索を使って調べてください：
${question}

必ずgoogleSearchツールを使用してください。
`.trim();

    const contents = [
      {
        role: 'user' as const,
        parts: [{ text: searchPrompt }],
      },
    ];

    this.logger.log('Gemini APIを呼び出します', {
      model: 'gemini-2.5-flash',
      hasTools: true,
      questionLength: question.length,
    });

    let answer: string;
    let sources: WebSource[];
    let confidence: number;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          tools: [{ 
            googleSearch: {} 
          }],
        },
      });

      this.logger.log('Gemini APIレスポンスを受信', {
        hasResponse: !!response,
        responseType: typeof response,
      });

      answer = this.extractText(response);
      sources = this.extractWebSources(response);
      confidence = this.calculateConfidence(answer, sources);

      this.logger.log(
        `Web search completed: sources=${sources.length} confidence=${confidence.toFixed(2)} answerLength=${answer.length}`,
      );
      
      if (sources.length === 0) {
        this.logger.warn('Web検索結果が空です', {
          question: question.substring(0, 100),
          answer: answer.substring(0, 100),
        });
      }
    } catch (error) {
      this.logger.error('Gemini APIエラー', {
        error: error.message,
        stack: error.stack,
        question: question.substring(0, 100),
      });
      throw error;
    }

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
   * 最初の候補の最初のパートのみを使用（重複回答を防ぐため）
   */
  private extractText(response: unknown): string {
    const resp = response as {
      text?: () => string;
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
        finishReason?: string;
      }>;
    };

    // 簡易的なtext()メソッドがある場合は使用
    if (typeof resp?.text === 'function') {
      return resp.text();
    }

    const candidates = resp?.candidates || [];
    
    // candidatesが複数ある場合の警告
    if (candidates.length > 1) {
      this.logger.warn('Multiple candidates found in response', {
        candidatesCount: candidates.length,
        finishReasons: candidates.map(c => c.finishReason),
      });
    }

    // 最初の候補のみを使用
    const firstCandidate = candidates[0];
    if (!firstCandidate) {
      return '';
    }

    const parts = firstCandidate.content?.parts || [];
    
    // partsが複数ある場合の警告とログ
    if (parts.length > 1) {
      this.logger.warn('Multiple parts found in candidate', {
        partsCount: parts.length,
        partLengths: parts.map(p => p.text?.length || 0),
      });
      
      // 各パートの最初の100文字をログ出力
      parts.forEach((part, index) => {
        if (part.text) {
          this.logger.log(`Part ${index} preview:`, {
            preview: part.text.substring(0, 100),
            length: part.text.length,
          });
        }
      });
    }

    // 最初のパートのみを返す（重複を防ぐため）
    return parts[0]?.text || '';
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
          webSearchQueries?: string[];
          searchEntryPoint?: {
            renderedContent?: string;
          };
        };
      }>;
    };

    const candidates = resp?.candidates || [];

    for (const candidate of candidates) {
      const groundingMetadata = candidate?.groundingMetadata;
      if (!groundingMetadata) continue;

      const chunks = groundingMetadata.groundingChunks || [];

      // デバッグログを追加
      if (chunks.length > 0) {
        this.logger.log('Grounding chunks found:', {
          chunksCount: chunks.length,
          firstChunk: JSON.stringify(chunks[0], null, 2).substring(0, 500),
        });
      }

      for (const chunk of chunks) {
        // chunk.webオブジェクト全体をログ出力して構造を確認
        if (chunk.web) {
          this.logger.log('Web chunk structure:', {
            hasTitle: !!chunk.web.title,
            hasUri: !!chunk.web.uri,
            hasUrl: !!(chunk.web as any).url,
            webKeys: Object.keys(chunk.web),
            web: chunk.web,
          });
          
          // uri または url フィールドを確認
          const url = chunk.web.uri || (chunk.web as any).url || '';
          
          const webSource = {
            title: chunk.web.title || 'Untitled',
            url: url,
            snippet: chunk.web.snippet || '',
          };
          
          // URLが正しく設定されているか確認
          if (!webSource.url) {
            this.logger.warn('Web source URL is empty after extraction', {
              web: chunk.web,
              extractedUrl: url,
            });
          }
          
          sources.push(webSource);
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

import { Injectable, Logger } from '@nestjs/common';
import {
  FileSearchAssistant,
  type FileSearchAnswerOptions,
  type FileSearchAnswerResult,
  type FileDocument,
} from './fileSearchAssistant';
import {
  WebSearchAssistant,
  type WebSource,
  type WebSearchResult,
} from './webSearchAssistant';
import { GeneralKnowledgeAssistant } from './generalKnowledgeAssistant';
import type { Message } from '../../Entity/Message';
import { createUUID, type UUID } from '../../common/uuid';
import {
  ResponseType,
  type FileSearchSource,
} from '../dto/llmGenerateResponse.dto';
import { InMemoryCacheService } from '../cache/inMemoryCacheService';
import type { SSEEvent } from '../dto/sseEvent.types';

export type HybridAnswerResult = {
  type: ResponseType;
  answer: string;
  message: Message;
  sources?: {
    fileSearch?: FileSearchSource[];
    webSearch?: WebSource[];
  };
};

export type HybridSearchOptions = FileSearchAnswerOptions & {
  requireWebSearch: boolean;
};

// タイムアウト設定
const TIMEOUT = {
  FILE_SEARCH: 60000, // 60秒（FileSearchは時間がかかる場合がある）
  WEB_SEARCH: 60000, // 60秒（Web検索は時間がかかる場合がある）
  SYNTHESIS: 30000, // 30秒
};

/**
 * HybridRagAssistant V2
 *
 * シンプル化された実装:
 * - 社内RAGは常に実行
 * - requireWebSearch=trueの場合、社内RAG結果をWeb検索で補強
 */
@Injectable()
export class HybridRagAssistant extends FileSearchAssistant {
  private readonly logger = new Logger(HybridRagAssistant.name);

  constructor(
    private readonly ragAssistant: FileSearchAssistant,
    private readonly webAssistant: WebSearchAssistant,
    private readonly generalAssistant: GeneralKnowledgeAssistant,
    private readonly cacheService: InMemoryCacheService,
  ) {
    super();
  }

  /**
   * メイン回答ロジック（シンプル化）
   */
  async answerQuestion(
    question: string,
    options: HybridSearchOptions,
  ): Promise<HybridAnswerResult> {
    this.logger.log(
      `Processing question with requireWebSearch=${options.requireWebSearch}`,
    );

    // Step 1: 必ず社内RAGを実行（完成された回答を取得）
    const ragResult = await this.tryFileSearch(question, options);

    // Step 2: Web検索が必要な場合、RAG結果を元にWeb補強
    if (options.requireWebSearch) {
      this.logger.log('Web検索補強を開始します', {
        question,
        requireWebSearch: options.requireWebSearch,
        ragAnswerLength: ragResult.answer.length,
      });

      try {
        const enhancedResult = await this.enhanceWithWebSearch(
          question,
          ragResult.answer,
          options,
        );
        this.logger.log('Web検索補強が成功しました', {
          hasWebSources: !!enhancedResult.sources?.webSearch?.length,
          webSourcesCount: enhancedResult.sources?.webSearch?.length || 0,
        });
        return enhancedResult;
      } catch (error) {
        this.logger.error('Web search enhancement failed', {
          error: error.message,
          stack: error.stack,
          question,
        });

        // Web検索失敗時は社内RAGの結果にエラーメッセージを追加
        return {
          ...ragResult,
          answer: `${ragResult.answer}\n\n※ Web検索でエラーが発生しました: ${error.message}`,
        };
      }
    }

    // Step 3: Web検索不要の場合は社内RAGの結果をそのまま返す
    return ragResult;
  }

  /**
   * ストリーミング版 メイン回答ロジック
   *
   * パイプラインの各段階でstepイベントを発行し、
   * LLMの応答をチャンクごとにyieldする。
   *
   * NOTE: Web検索がONの場合、RAGの回答は内部で保持するだけで
   * クライアントにはWeb検索で統合された回答のみをストリーム出力する。
   * これにより、2つの回答が表示される問題を防ぐ。
   */
  async *answerQuestionStream(
    question: string,
    options: HybridSearchOptions,
  ): AsyncGenerator<SSEEvent> {
    this.logger.log(
      `Processing question (streaming) with requireWebSearch=${options.requireWebSearch}`,
    );

    // Step 1: FileSearch（常に実行）
    yield { type: 'step', data: 'ドキュメント検索中...', metadata: { step: 'file_search' } };

    let ragAnswer = '';
    let ragSources: any = null;

    try {
      // ragAssistant が GeminiFileSearchClient の場合 answerQuestionStream が使える
      const ragClient = this.ragAssistant as any;
      if (typeof ragClient.answerQuestionStream === 'function') {
        for await (const event of ragClient.answerQuestionStream(question, options)) {
          if (event.type === 'chunk') {
            ragAnswer += event.data;
          }
          if (event.type === 'sources') {
            ragSources = event.metadata?.sources;
          }
          // Web検索がOFFの場合のみ、RAGの結果を直接ストリーム出力
          if (!options.requireWebSearch) {
            yield event;
          }
        }
      } else {
        // ストリーミング非対応の場合はフォールバック
        const result = await this.ragAssistant.answerQuestion(question, options);
        ragAnswer = result.answer;
        ragSources = result.sources;
        // Web検索がOFFの場合のみ出力
        if (!options.requireWebSearch) {
          yield { type: 'chunk', data: result.answer };
          if (result.sources?.fileSearch && result.sources.fileSearch.length > 0) {
            yield {
              type: 'sources',
              data: '',
              metadata: { sources: { fileSearch: result.sources.fileSearch } },
            };
          }
        }
      }
    } catch (error) {
      this.logger.error('FileSearch streaming failed, falling back to general assistant', error);

      // GeneralKnowledgeAssistant でフォールバック（ストリーミング）
      for await (const event of this.generalAssistant.answerStream(question, {
        conversationId: options.conversationId as string,
        history: options.history,
        systemInstruction: options.systemInstruction,
        cachedContentName: options.geminiCacheName,
      })) {
        if (event.type === 'chunk') {
          ragAnswer += event.data;
        }
        // Web検索がOFFの場合のみ出力
        if (!options.requireWebSearch) {
          yield event;
        }
      }
    }

    // Step 2: Web検索補強（オプション）
    if (options.requireWebSearch) {
      yield { type: 'step', data: 'Web検索中...', metadata: { step: 'web_search' } };

      try {
        yield { type: 'step', data: '回答を統合中...', metadata: { step: 'synthesis' } };

        // Web検索補強プロンプトを構築して、ストリーミングで統合回答を生成
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        const enhancementPrompt = `
あなたは最新情報検索の専門家です。現在は${currentYear}年${currentMonth}月です。

以下の社内RAGの回答を、Web検索で得た最新情報で補強して、1つの統合された回答を作成してください。

【元の質問】
${question}

【社内RAGの回答】
${ragAnswer}

【回答の統合指示】
1. 社内RAGの回答とWeb検索の情報を自然に融合させて、一つの統合された文章として回答する
2. 「社内資料では〜ですが、Web検索によると〜」のような形で情報源を自然に示す
3. 別々のセクションに分けずに、一つの流れのある文章として構成する
4. 必ず${currentYear}年${currentMonth}月時点の最新情報を検索して含める
`.trim();

        for await (const event of this.webAssistant.searchStream(enhancementPrompt, {
          systemInstruction: options.systemInstruction,
        })) {
          yield event; // Web検索で統合された回答をストリーム出力
        }
      } catch (error) {
        this.logger.error('Web search streaming failed', error);
        // Web検索が失敗した場合は、RAGの回答をフォールバックとして出力
        yield { type: 'chunk', data: ragAnswer };
        if (ragSources?.fileSearch && ragSources.fileSearch.length > 0) {
          yield {
            type: 'sources',
            data: '',
            metadata: { sources: { fileSearch: ragSources.fileSearch } },
          };
        }
        yield {
          type: 'error',
          data: 'Web検索中にエラーが発生しました（社内RAGの回答を表示しています）',
          metadata: {
            error: {
              code: 'WEB_SEARCH_ERROR',
              message: (error as Error).message,
              retryable: false,
            },
          },
        };
      }
    }

    yield { type: 'done', data: '' };
  }

  /**
   * FileSearch試行
   */
  private async tryFileSearch(
    question: string,
    options: FileSearchAnswerOptions,
  ): Promise<HybridAnswerResult> {
    this.logger.log('Executing FileSearch');

    try {
      const result = await this.withTimeout(
        this.ragAssistant.answerQuestion(question, options),
        TIMEOUT.FILE_SEARCH,
        'FileSearch timeout',
      );

      return {
        type: ResponseType.ANSWER,
        answer: result.answer,
        message: result.message,
        sources: result.sources,
      };
    } catch (error) {
      this.logger.error('FileSearch failed', error);

      // FileSearch失敗時でも一般知識で回答（緩和版）
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

  /**
   * 社内RAGの回答をWeb検索で補強
   */
  private async enhanceWithWebSearch(
    originalQuestion: string,
    ragAnswer: string,
    options: FileSearchAnswerOptions,
  ): Promise<HybridAnswerResult> {
    // キャッシュキーの生成（question + ragAnswerのハッシュ）
    const cacheKey = this.generateCacheKey(originalQuestion, ragAnswer);

    // キャッシュチェック
    const cached = await this.cacheService.getOrCreateWebSearch(
      cacheKey,
      async () => {
        // Web検索補強の実行
        return await this.executeWebEnhancement(
          originalQuestion,
          ragAnswer,
          options,
        );
      },
    );

    return cached;
  }

  /**
   * 実際のWeb検索補強処理
   */
  private async executeWebEnhancement(
    originalQuestion: string,
    ragAnswer: string,
    options: FileSearchAnswerOptions,
  ): Promise<HybridAnswerResult> {
    this.logger.log('executeWebEnhancementを開始', {
      originalQuestion,
      ragAnswerLength: ragAnswer.length,
      hasSystemInstruction: !!options.systemInstruction,
    });

    // 現在の年月を取得
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const enhancementPrompt = `
あなたは最新情報検索の専門家です。
現在は${currentYear}年${currentMonth}月です。

以下の社内RAGの回答を、Web検索で得た最新情報で補強して、【必ず1つの統合された回答のみ】を作成してください。

【現在の時期】
${currentYear}年${currentMonth}月

【元の質問】
${originalQuestion}

【社内RAGの回答】
${ragAnswer}

【Web検索の実行指示】
1. 必ずGoogle検索を使用して、${currentYear}年の最新の情報を取得してください
2. ${currentYear}年${currentMonth}月現在の最新情報を必ず含めて検索してください
3. 古い情報と新しい情報が混在する場合は、最新の情報を優先してください
4. 日付や時期に関する情報は必ず明記してください
5. 検索結果のURLや出典を必ず含めてください

【回答の統合指示】
1. 社内RAGの回答とWeb検索の情報を自然に融合させて、一つの統合された文章として回答する
2. 「社内資料では〜ですが、Web検索によると〜」のような形で、情報源を自然に示しながら統合する
3. 別々のセクションに分けずに、一つの流れのある文章として構成する
4. 社内情報になかった最新情報や補足情報を自然に織り込む
5. 絶対に「【社内情報とWeb情報を統合した回答】」のようなセクション分けをしない
6. 一つの自然な会話として成立するように回答する

【絶対的な制約】
- 複数の回答候補を生成しないでください
- 1つの質問に対して1つの統合された回答のみを出力してください
- 異なるバージョンの回答を並べないでください
- 必ず${currentYear}年${currentMonth}月時点の最新情報を検索して含めてください

【悪い例】
📄 社内情報: これは〜です。
🌐 Web情報: あれは〜です。

【良い例】
社内資料を確認しましたが、日向坂に関する情報は見つかりませんでした。そこでWeb検索で調べたところ、日向坂46の最新シングルは${currentYear}年1月29日リリースの「卓越した雰囲気」であることが分かりました。このように一つの文章として自然に情報を統合してください。
`;

    this.logger.log('WebAssistant.searchを呼び出します', {
      promptLength: enhancementPrompt.length,
    });

    const webResult = await this.withTimeout(
      this.webAssistant.search(enhancementPrompt, {
        systemInstruction: options.systemInstruction,
      }),
      TIMEOUT.WEB_SEARCH,
      'Web search timeout',
    );

    this.logger.log('WebAssistant.searchが完了', {
      hasAnswer: !!webResult.answer,
      answerLength: webResult.answer?.length || 0,
      hasWebSources: !!webResult.sources?.length,
      webSourcesCount: webResult.sources?.length || 0,
    });

    // 統合された回答を作成
    const enhancedAnswer = this.formatEnhancedAnswer(ragAnswer, webResult);

    return {
      type: ResponseType.ANSWER,
      answer: enhancedAnswer,
      message: this.createMessage(enhancedAnswer, options.conversationId),
      sources: {
        fileSearch: (options as any).sources?.fileSearch,
        webSearch: webResult.sources,
      },
    };
  }

  /**
   * 補強された回答のフォーマット
   */
  private formatEnhancedAnswer(
    ragAnswer: string,
    webResult: WebSearchResult,
  ): string {
    // Web検索結果が実質的な内容を含んでいるか確認
    if (
      !webResult.answer ||
      webResult.answer.length < 100 ||
      webResult.confidence < 0.3
    ) {
      // Web検索結果が不十分な場合は社内RAGのみ返す
      return ragAnswer;
    }

    // Web検索で統合された回答をそのまま返す
    // (enhancementPromptで既に統合指示を出しているため)
    return webResult.answer;
  }

  /**
   * キャッシュキー生成
   */
  private generateCacheKey(question: string, ragAnswer: string): string {
    // 簡易ハッシュ関数
    const str = `${question}::${ragAnswer.substring(0, 200)}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `web_search_${Math.abs(hash).toString(36)}`;
  }

  /**
   * メッセージ生成ヘルパー
   */
  private createMessage(content: string, conversationId: UUID): Message {
    return {
      messageId: createUUID(),
      conversationId,
      userRole: 'ASSISTANT',
      content,
      createdAt: new Date(),
    };
  }

  /**
   * タイムアウトラッパー
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
      ),
    ]);
  }

  /**
   * FileSearchAssistantインターフェース実装 - ドキュメントアップロード
   */
  async uploadDocuments(documents: FileDocument[]): Promise<void> {
    await this.ragAssistant.uploadDocuments(documents);
  }
}

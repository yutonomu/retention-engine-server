import { Injectable, Logger } from '@nestjs/common';
import {
  FileSearchAssistant,
  type FileSearchAnswerOptions,
  type FileSearchAnswerResult,
  type FileDocument,
} from './fileSearchAssistant';
import { WebSearchAssistant, type WebSource, type WebSearchResult } from './webSearchAssistant';
import { GeneralKnowledgeAssistant } from './generalKnowledgeAssistant';
import type { Message } from '../../Entity/Message';
import { createUUID, type UUID } from '../../common/uuid';
import { ResponseType, type WebSearchConfirmationLabels } from '../dto/llmGenerateResponse.dto';
import type { SearchSettings } from '../dto/llmGenerateRequest.dto';

export type HybridAnswerResult = {
  type: ResponseType;
  answer: string;
  message: Message;
  needsWebSearch?: boolean;
  webSearchReason?: string;
  confirmationLabels?: WebSearchConfirmationLabels;
  sources?: {
    fileSearch?: string[];
    webSearch?: WebSource[];
  };
};

export type HybridSearchOptions = FileSearchAnswerOptions & {
  searchSettings?: SearchSettings;
};

// タイムアウト設定
const TIMEOUT = {
  QUESTION_CLASSIFICATION: 15000, // 15秒（分類）
  FILE_SEARCH: 60000, // 60秒（FileSearchは時間がかかる場合がある）
  WEB_SEARCH: 60000, // 60秒（Web検索は時間がかかる場合がある）
  LLM_JUDGMENT: 10000, // 10秒
  SYNTHESIS: 30000, // 30秒
};

/**
 * HybridRagAssistant
 *
 * FileSearchAssistantインターフェースを実装（Composition over Inheritance）
 * - FileSearch、WebSearch、GeneralKnowledgeを組み合わせて最適な回答を生成
 */
@Injectable()
export class HybridRagAssistant extends FileSearchAssistant {
  private readonly logger = new Logger(HybridRagAssistant.name);

  constructor(
    private readonly ragAssistant: FileSearchAssistant,
    private readonly webAssistant: WebSearchAssistant,
    private readonly generalAssistant: GeneralKnowledgeAssistant,
  ) {
    super();
  }

  /**
   * メイン回答ロジック
   */
  async answerQuestion(
    question: string,
    options: HybridSearchOptions,
  ): Promise<HybridAnswerResult> {
    const settings: SearchSettings = {
      enableFileSearch: options.searchSettings?.enableFileSearch ?? true,
      allowWebSearch: options.searchSettings?.allowWebSearch ?? false,
      executeWebSearch: options.searchSettings?.executeWebSearch,
    };

    this.logger.log(
      `Processing question with settings: ` +
        `fileSearch=${settings.enableFileSearch}, ` +
        `webSearch=${settings.allowWebSearch}, ` +
        `executeWeb=${settings.executeWebSearch}`,
    );

    // Step 0: 質問タイプ判定（FileSearchが有効な場合のみ）
    if (settings.enableFileSearch) {
      const classification = await this.classifyQuestion(question);

      if (!classification.needsFileSearch) {
        this.logger.log(
          `Skipping FileSearch - question classified as casual: ${classification.reason}`,
        );

        // Web検索が許可されている場合、Web検索確認を提案
        if (settings.allowWebSearch) {
          this.logger.log('Casual question with web search enabled - offering web search');
          const generalResult = await this.generalOnly(question, options);

          // Web検索実行が承認済みの場合
          if (settings.executeWebSearch) {
            return await this.executeWebSearch(question, generalResult, options);
          }

          // Web検索確認を提案
          return this.createWebSearchConfirmation(
            generalResult.answer,
            '最新情報やより詳しい情報が必要な場合',
            options.conversationId,
          );
        }

        // 日常会話/雑談 → すぐに一般LLM応答
        return await this.generalOnly(question, options);
      }
    }

    // Step 1: FileSearch実行（有効な場合）
    let ragResult: HybridAnswerResult | null = null;

    if (settings.enableFileSearch) {
      ragResult = await this.tryFileSearch(question, options);
    }

    // Step 2: Web検索実行（ユーザーが承認した場合）
    if (settings.executeWebSearch && settings.allowWebSearch) {
      this.logger.log('User approved web search - executing');
      return await this.executeWebSearch(question, ragResult, options);
    }

    // Step 3: Web検索必要性判断
    if (settings.allowWebSearch) {
      const needsWeb = await this.shouldAskForWebSearch(
        ragResult,
        question,
        settings.enableFileSearch,
      );

      if (needsWeb.needed) {
        return this.createWebSearchConfirmation(
          ragResult?.answer || '',
          needsWeb.reason,
          options.conversationId,
        );
      }
    }

    // Step 4: 最終回答返却
    if (ragResult) {
      return ragResult;
    }

    // FileSearch無効でWeb検索もしない → 一般LLMのみ
    return await this.generalOnly(question, options);
  }

  /**
   * 質問タイプ判定（FileSearch必要性）
   */
  private async classifyQuestion(
    question: string,
  ): Promise<{ needsFileSearch: boolean; reason: string }> {
    try {
      return await this.withTimeout(
        this.generalAssistant.classifyQuestionType(question),
        TIMEOUT.QUESTION_CLASSIFICATION,
        'Question classification timeout',
      );
    } catch (error) {
      this.logger.warn('Question classification failed, defaulting to FileSearch', error);
      // 分類失敗時は安全にFileSearch実行
      return { needsFileSearch: true, reason: '分類タイムアウト' };
    }
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

      const fileSearchSources = this.extractRagSources(result.answer);

      return {
        type: ResponseType.ANSWER,
        answer: result.answer,
        message: result.message,
        sources: {
          fileSearch: fileSearchSources,
        },
      };
    } catch (error) {
      this.logger.error('FileSearch failed', error);

      return {
        type: ResponseType.ANSWER,
        answer: '社内資料の検索に失敗しました。',
        message: this.createMessage('社内資料の検索に失敗しました。', options.conversationId),
      };
    }
  }

  /**
   * Web検索が必要か判断
   */
  private async shouldAskForWebSearch(
    ragResult: HybridAnswerResult | null,
    question: string,
    fileSearchEnabled: boolean,
  ): Promise<{ needed: boolean; reason: string }> {
    // FileSearch無効なら無条件でWeb検索必要
    if (!fileSearchEnabled) {
      return {
        needed: true,
        reason: '社内資料検索が無効化されているため',
      };
    }

    // FileSearch結果がなければWeb検索必要
    if (!ragResult || !ragResult.answer) {
      return {
        needed: true,
        reason: '社内資料に情報が見つからなかったため',
      };
    }

    // 明示的に情報なし表現があればWeb検索必要
    if (
      ragResult.answer.includes('見つかりませんでした') ||
      ragResult.answer.includes('情報がありません') ||
      ragResult.answer.includes('該当する情報')
    ) {
      return {
        needed: true,
        reason: '社内資料に情報が見つからなかったため',
      };
    }

    // 回答が短すぎればWeb検索を検討
    if (ragResult.answer.length < 50) {
      return {
        needed: true,
        reason: '回答が不十分なため',
      };
    }

    // LLMに判断を依頼（タイムアウト適用）
    try {
      const judgment = await this.withTimeout(
        this.generalAssistant.judgeAnswerSufficiency(question, ragResult.answer),
        TIMEOUT.LLM_JUDGMENT,
        'LLM judgment timeout',
      );

      if (!judgment.sufficient) {
        this.logger.log(`Answer judged insufficient: ${judgment.reason}`);
        return {
          needed: true,
          reason: judgment.reason || '回答が不十分なため',
        };
      }

      this.logger.log('Answer judged sufficient');
      return { needed: false, reason: '' };
    } catch (error) {
      this.logger.warn('Failed to judge answer sufficiency', error);
      // 判断失敗時は安全にWeb検索を提案しない
      return { needed: false, reason: '' };
    }
  }

  /**
   * Web検索確認レスポンス生成
   */
  private createWebSearchConfirmation(
    currentAnswer: string,
    reason: string,
    conversationId: UUID,
  ): HybridAnswerResult {
    const confirmationMessage = currentAnswer
      ? `${currentAnswer}\n\n${reason}、より詳しい情報を得るため、Web検索を実行しますか？`
      : `${reason}、より詳しい情報を得るため、Web検索を実行しますか？`;

    // 回答の言語を検出してボタンラベルを決定
    const labels = this.detectLanguageAndGetLabels(currentAnswer || confirmationMessage);

    this.logger.log(`Creating web search confirmation (language: ${labels.language})`);

    return {
      type: ResponseType.WEB_SEARCH_CONFIRMATION,
      answer: confirmationMessage.trim(),
      needsWebSearch: true,
      webSearchReason: reason,
      confirmationLabels: {
        confirm: labels.confirm,
        cancel: labels.cancel,
      },
      message: this.createMessage(confirmationMessage, conversationId),
    };
  }

  /**
   * テキストから言語を検出し、適切なボタンラベルを返す
   */
  private detectLanguageAndGetLabels(text: string): {
    language: 'ja' | 'ko' | 'en';
    confirm: string;
    cancel: string;
  } {
    // 日本語文字（ひらがな、カタカナ、一部の漢字）
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
    // 韓国語文字（ハングル）
    const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF]/;

    const japaneseCount = (text.match(japanesePattern) || []).length;
    const koreanCount = (text.match(koreanPattern) || []).length;

    // 韓国語が多い場合
    if (koreanCount > japaneseCount && koreanCount > 5) {
      return { language: 'ko', confirm: '예', cancel: '아니오' };
    }

    // 日本語が多い場合（デフォルト）
    if (japaneseCount > 5) {
      return { language: 'ja', confirm: 'はい', cancel: 'いいえ' };
    }

    // 英語または判定不能の場合は日本語をデフォルト
    return { language: 'ja', confirm: 'はい', cancel: 'いいえ' };
  }

  /**
   * Web検索実行
   */
  private async executeWebSearch(
    question: string,
    ragResult: HybridAnswerResult | null,
    options: FileSearchAnswerOptions,
  ): Promise<HybridAnswerResult> {
    this.logger.log('Executing web search');

    try {
      const webResult = await this.withTimeout(
        this.webAssistant.search(question, {
          history: options.history,
        }),
        TIMEOUT.WEB_SEARCH,
        'Web search timeout',
      );

      // FileSearch + Web結果統合
      if (
        ragResult &&
        ragResult.answer &&
        !ragResult.answer.includes('見つかりませんでした') &&
        !ragResult.answer.includes('失敗しました')
      ) {
        return await this.synthesizeResults(question, ragResult, webResult, options);
      }

      // Webのみの場合
      const webOnlyAnswer = this.formatWebResult(webResult);

      return {
        type: ResponseType.ANSWER,
        answer: webOnlyAnswer,
        message: this.createMessage(webOnlyAnswer, options.conversationId),
        sources: {
          webSearch: webResult.sources,
        },
      };
    } catch (error) {
      this.logger.error('Web search failed', error);

      // Web検索失敗時はRAG結果を返却（あれば）
      if (ragResult) {
        return {
          ...ragResult,
          answer: `${ragResult.answer}\n\n※ Web検索に失敗しました。`,
        };
      }

      return {
        type: ResponseType.ANSWER,
        answer: 'Web検索に失敗しました。申し訳ございません。',
        message: this.createMessage('Web検索に失敗しました。', options.conversationId),
      };
    }
  }

  /**
   * FileSearch + Web結果をLLMが統合
   */
  private async synthesizeResults(
    question: string,
    ragResult: HybridAnswerResult,
    webResult: WebSearchResult,
    options: FileSearchAnswerOptions,
  ): Promise<HybridAnswerResult> {
    this.logger.log('Synthesizing FileSearch and Web results');

    const synthesisPrompt = `
以下の情報を統合して、質問に対する包括的な回答を生成してください。

【質問】
${question}

【社内資料からの情報】
${ragResult.answer}

【Web検索からの情報】
${webResult.answer}

【指示】
1. 両方の情報を活用して、最も完全な回答を生成してください
2. 情報源を明記してください:
   - 社内資料: 📄 マークを使用
   - Web検索: 🌐 マークを使用
3. 矛盾する情報がある場合は、社内資料を優先してください
4. 簡潔で分かりやすい日本語で回答してください
`;

    try {
      const result = await this.withTimeout(
        this.generalAssistant.answer(synthesisPrompt, {
          conversationId: options.conversationId as string,
        }),
        TIMEOUT.SYNTHESIS,
        'Synthesis timeout',
      );

      return {
        type: ResponseType.ANSWER,
        answer: result.answer,
        message: result.message,
        sources: {
          fileSearch: ragResult.sources?.fileSearch,
          webSearch: webResult.sources,
        },
      };
    } catch (error) {
      this.logger.error('Synthesis failed, returning combined raw results', error);

      // 統合失敗時は単純結合
      const combinedAnswer = `
📄 社内資料:
${ragResult.answer}

🌐 Web検索:
${webResult.answer}
`.trim();

      return {
        type: ResponseType.ANSWER,
        answer: combinedAnswer,
        message: this.createMessage(combinedAnswer, options.conversationId),
        sources: {
          fileSearch: ragResult.sources?.fileSearch,
          webSearch: webResult.sources,
        },
      };
    }
  }

  /**
   * FileSearchなしで一般LLMのみ
   */
  private async generalOnly(
    question: string,
    options: FileSearchAnswerOptions,
  ): Promise<HybridAnswerResult> {
    this.logger.log('Using general LLM only (FileSearch disabled)');

    try {
      const result = await this.generalAssistant.answer(question, {
        conversationId: options.conversationId as string,
        history: options.history,
        systemInstruction: options.systemInstruction,
        cachedContentName: options.geminiCacheName, // Gemini Context Caching
      });

      // キャッシュされたトークン数ログ
      if (result.cachedContentTokenCount) {
        this.logger.log(
          `Token savings: ${result.cachedContentTokenCount} tokens from cache`,
        );
      }

      return {
        type: ResponseType.ANSWER,
        answer: result.answer,
        message: result.message,
      };
    } catch (error) {
      this.logger.error('General LLM answer failed', error);

      return {
        type: ResponseType.ANSWER,
        answer: '申し訳ございませんが、回答を生成できませんでした。',
        message: this.createMessage('回答生成に失敗しました。', options.conversationId),
      };
    }
  }

  /**
   * Web検索結果フォーマット
   */
  private formatWebResult(webResult: WebSearchResult): string {
    let formatted = `🌐 Web検索結果:\n${webResult.answer}`;

    if (webResult.sources && webResult.sources.length > 0) {
      formatted += `\n\n---\n📚 出典:\n`;
      formatted += webResult.sources
        .slice(0, 5) // 最大5件のみ表示
        .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}`)
        .join('\n\n');
    }

    return formatted;
  }

  /**
   * RAGソース抽出（レスポンステキストから）
   */
  private extractRagSources(answer: string): string[] {
    // ファイル名パターン抽出（例: [filename.txt], 【filename.pdf】）
    const patterns = [
      /\[([^\]]+\.(txt|pdf|doc|docx|md))\]/gi,
      /【([^】]+\.(txt|pdf|doc|docx|md))】/gi,
      /「([^」]+\.(txt|pdf|doc|docx|md))」/gi,
    ];

    const sources: string[] = [];

    for (const pattern of patterns) {
      const matches = answer.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !sources.includes(match[1])) {
          sources.push(match[1]);
        }
      }
    }

    return sources;
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

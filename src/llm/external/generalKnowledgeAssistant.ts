import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { Message } from '../../Entity/Message';
import { createUUID, type UUID } from '../../common/uuid';

export type GeneralAnswerResult = {
  answer: string;
  message: Message;
  cachedContentTokenCount?: number; // キャッシュされたトークン数（コスト削減追跡用）
};

export type GeneralAnswerOptions = {
  conversationId?: string;
  history?: Message[];
  systemInstruction?: string;
  cachedContentName?: string; // Geminiキャッシュ名（トークンコスト削減）
};

@Injectable()
export class GeneralKnowledgeAssistant {
  private readonly ai: GoogleGenAI;
  private readonly logger = new Logger(GeneralKnowledgeAssistant.name);

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for GeneralKnowledgeAssistant');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * 一般知識ベース回答（Toolなしで純粋LLMのみ）
   * - cachedContentNameが提供されればGemini Context Caching使用（トークンコスト75-90%削減）
   */
  async answer(
    prompt: string,
    options: GeneralAnswerOptions = {},
  ): Promise<GeneralAnswerResult> {
    this.logger.log(`Generating general knowledge answer`);

    const history = options.history || [];

    const contents = [
      ...history.map((msg) => ({
        role: msg.userRole === 'NEW_HIRE' ? ('user' as const) : ('model' as const),
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
      },
    ];

    try {
      // キャッシュがあればcachedContent使用、なければ通常リクエスト
      const requestConfig: Record<string, unknown> = {
        model: 'gemini-2.0-flash',
        contents,
      };

      // システムインストラクション（キャッシュがない時のみ）
      if (options.systemInstruction && !options.cachedContentName) {
        requestConfig.config = {
          systemInstruction: options.systemInstruction,
        };
      }

      // Gemini Context Caching使用
      if (options.cachedContentName) {
        requestConfig.config = {
          ...((requestConfig.config as object) || {}),
          cachedContent: options.cachedContentName,
        };
        this.logger.log(`Using Gemini cached content: ${options.cachedContentName}`);
      }

      const response = await this.ai.models.generateContent(
        requestConfig as unknown as Parameters<typeof this.ai.models.generateContent>[0],
      );

      const answer = this.extractText(response);

      // キャッシュされたトークン数抽出
      const cachedTokenCount = this.extractCachedTokenCount(response);

      const message: Message = {
        messageId: createUUID(),
        conversationId: (options.conversationId as UUID) || createUUID(),
        userRole: 'ASSISTANT',
        content: answer,
        createdAt: new Date(),
      };

      if (cachedTokenCount) {
        this.logger.log(
          `General knowledge answer generated: length=${answer.length}, cachedTokens=${cachedTokenCount}`,
        );
      } else {
        this.logger.log(`General knowledge answer generated: length=${answer.length}`);
      }

      return { answer, message, cachedContentTokenCount: cachedTokenCount };
    } catch (error) {
      this.logger.error('General knowledge answer failed', error);
      throw error;
    }
  }

  /**
   * キャッシュされたトークン数抽出
   */
  private extractCachedTokenCount(response: unknown): number | undefined {
    const resp = response as {
      usageMetadata?: {
        cachedContentTokenCount?: number;
      };
    };
    return resp?.usageMetadata?.cachedContentTokenCount;
  }

  /**
   * 質問タイプ判定 - FileSearchが必要か分類
   * - デバッグモード：常に社内検索をオン
   */
  async classifyQuestionType(
    question: string,
  ): Promise<{ needsFileSearch: boolean; reason: string }> {
    this.logger.log(`Classifying question type: "${question.substring(0, 30)}..." (DEBUG: forcing FileSearch)`);

    // デバッグ用：常に社内検索を実行
    return { needsFileSearch: true, reason: 'デバッグモード' };
  }

  /**
   * 質問分類結果パース
   */
  private parseClassification(answer: string): { needsFileSearch: boolean; reason: string } {
    try {
      const jsonMatch = answer.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return { needsFileSearch: true, reason: '' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        needsFileSearch: parsed.needsFileSearch !== false,
        reason: parsed.reason || '',
      };
    } catch (error) {
      this.logger.warn('Failed to parse classification JSON', error);
      return { needsFileSearch: true, reason: '' };
    }
  }

  /**
   * 回答十分性判定（軽量版）
   * - 別途conversation作成なしで単一リクエストで判定
   */
  async judgeAnswerSufficiency(
    question: string,
    answer: string,
  ): Promise<{ sufficient: boolean; reason: string }> {
    this.logger.log('Judging answer sufficiency');

    const judgmentPrompt = `
あなたは回答の十分性を判断するアシスタントです。

【質問】
${question}

【社内資料からの回答】
${answer}

【判断タスク】
上記の回答が質問に対して十分かどうかを判断してください。

以下の場合は「不十分」と判断:
1. 「情報が見つかりませんでした」と明示的に述べている
2. 回答が質問の核心に答えていない
3. 情報量が極端に少ない（50文字未満）
4. 実時間情報や最新情報が必要だが提供されていない
5. 外部の一般知識が明らかに必要な質問である

JSON形式で回答してください:
{
  "sufficient": true/false,
  "reason": "判断理由を簡潔に（30文字以内）"
}

JSON以外の出力は不要です。
`.trim();

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: judgmentPrompt }],
          },
        ],
      });

      const responseText = this.extractText(response);
      this.logger.log(`Answer sufficiency judgment: ${responseText}`);
      return this.parseJudgment(responseText);
    } catch (error) {
      this.logger.warn('Failed to judge answer sufficiency', error);
      // 判定失敗時は安全に十分と判定
      return { sufficient: true, reason: '' };
    }
  }

  /**
   * LLM判定結果パース
   */
  private parseJudgment(answer: string): { sufficient: boolean; reason: string } {
    try {
      const jsonMatch = answer.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return { sufficient: true, reason: '' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sufficient: parsed.sufficient !== false,
        reason: parsed.reason || '',
      };
    } catch (error) {
      this.logger.warn('Failed to parse judgment JSON', error);
      return { sufficient: true, reason: '' };
    }
  }

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

    const candidates = resp?.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part?.text) return part.text;
      }
    }

    return '';
  }
}

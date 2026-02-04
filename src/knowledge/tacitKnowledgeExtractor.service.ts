import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { MESSAGE_PORT, type MessagePort } from '../message/message.port';
import { KNOWLEDGE_PORT, type KnowledgePort } from './knowledge.port';
import type { LlmKCCandidate, KCCandidate } from './knowledge.types';
import { TACIT_KNOWLEDGE_DETECTION_PROMPT } from '../llm/prompts/tacitKnowledgeDetection';

const SIMILARITY_THRESHOLD = 0.85;
const MIN_CONFIDENCE = 0.5;
const RECENT_MESSAGE_COUNT = 20;

@Injectable()
export class TacitKnowledgeExtractorService implements OnModuleInit {
  private readonly logger = new Logger(TacitKnowledgeExtractorService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(MESSAGE_PORT)
    private readonly messagePort: MessagePort,
    @Inject(KNOWLEDGE_PORT)
    private readonly knowledgePort: KnowledgePort,
  ) {}

  onModuleInit(): void {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. TacitKnowledgeExtractor is disabled.',
      );
      return;
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * 暗黙知を検出し、重複・低信頼度を除外した候補を返す
   */
  async detectTacitKnowledge(
    conversationId: string,
    startIndex?: number,
    range?: 'all' | 'recent',
  ): Promise<KCCandidate[]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'TacitKnowledgeExtractor is not initialized (missing API key).',
      );
    }

    // 1. メッセージ取得
    const allMessages =
      await this.messagePort.findAllByConversation(conversationId);
    if (allMessages.length === 0) {
      return [];
    }

    // 2. 範囲フィルタ
    let messages = allMessages;

    if (startIndex !== undefined && startIndex > 0) {
      messages = messages.slice(startIndex);
    } else if (range === 'recent') {
      messages = messages.slice(-RECENT_MESSAGE_COUNT);
    }

    if (messages.length === 0) {
      return [];
    }

    // 3. チャット履歴を文字列化（インデックス付き）
    const baseIndex =
      startIndex ??
      (range === 'recent'
        ? Math.max(0, allMessages.length - RECENT_MESSAGE_COUNT)
        : 0);
    const chatHistory = messages
      .map(
        (m, i) =>
          `[${baseIndex + i}][${m.role === 'ASSISTANT' ? 'AI' : '社員'}]: ${m.content}`,
      )
      .join('\n\n');

    // 4. LLM で暗黙知シグナル検出
    const llmCandidates = await this.callLlmForDetection(chatHistory);

    if (llmCandidates.length === 0) {
      return [];
    }

    // 5. confidence < 0.5 フィルタ + 重複チェック
    const results: KCCandidate[] = [];

    for (const item of llmCandidates) {
      if (item.confidence < MIN_CONFIDENCE) {
        continue;
      }

      // embedding 生成（検出時: situation + knowhow で生成）
      const textForEmbedding = `${item.situation} ${item.knowhow}`;
      const embedding = await this.generateEmbedding(textForEmbedding);

      if (embedding.length === 0) {
        // embedding 生成失敗時はスキップせず候補に含める
        results.push(this.toLlmCandidate(item));
        continue;
      }

      // 重複チェック (similarity >= 0.85 は重複とみなす)
      const similar = await this.knowledgePort.searchSimilar(
        embedding,
        SIMILARITY_THRESHOLD,
        1,
      );
      if (similar.length > 0) {
        this.logger.debug(
          `Skipping duplicate candidate "${item.title}" (similarity: ${similar[0].similarity})`,
        );
        continue;
      }

      results.push(this.toLlmCandidate(item));
    }

    return results;
  }

  /**
   * Story 2-6: トリガーコンテキスト付きで暗黙知検出
   * トリガーが蓄積された場合に呼び出され、excerptを追加コンテキストとして渡す
   */
  async detectTacitKnowledgeWithContext(
    conversationId: string,
    triggerExcerpts: string[],
  ): Promise<KCCandidate[]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'TacitKnowledgeExtractor is not initialized (missing API key).',
      );
    }

    // 1. メッセージ取得
    const allMessages =
      await this.messagePort.findAllByConversation(conversationId);
    if (allMessages.length === 0) {
      return [];
    }

    // 2. チャット履歴を文字列化（インデックス付き）
    const chatHistory = allMessages
      .map(
        (m, i) =>
          `[${i}][${m.role === 'ASSISTANT' ? 'AI' : '社員'}]: ${m.content}`,
      )
      .join('\n\n');

    // 3. トリガーコンテキストを追加
    const triggerContext =
      triggerExcerpts.length > 0
        ? `\n\n【重要: 以下の発話は暗黙知トリガーとして検出されています。特に注目してください】\n${triggerExcerpts.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n`
        : '';

    // 4. LLM で暗黙知シグナル検出（トリガーコンテキスト付き）
    const llmCandidates = await this.callLlmForDetectionWithContext(
      chatHistory,
      triggerContext,
    );

    if (llmCandidates.length === 0) {
      return [];
    }

    // 5. confidence < 0.5 フィルタ + 重複チェック
    const results: KCCandidate[] = [];

    for (const item of llmCandidates) {
      if (item.confidence < MIN_CONFIDENCE) {
        continue;
      }

      // embedding 生成（検出時: situation + knowhow で生成）
      const textForEmbedding = `${item.situation} ${item.knowhow}`;
      const embedding = await this.generateEmbedding(textForEmbedding);

      if (embedding.length === 0) {
        results.push(this.toLlmCandidate(item));
        continue;
      }

      // 重複チェック
      const similar = await this.knowledgePort.searchSimilar(
        embedding,
        SIMILARITY_THRESHOLD,
        1,
      );
      if (similar.length > 0) {
        this.logger.debug(
          `Skipping duplicate candidate "${item.title}" (similarity: ${similar[0].similarity})`,
        );
        continue;
      }

      results.push(this.toLlmCandidate(item));
    }

    this.logger.log(
      `[TacitKnowledgeExtractor] Found ${results.length} candidates with trigger context ` +
        `(${triggerExcerpts.length} excerpts)`,
    );

    return results;
  }

  private toLlmCandidate(item: LlmKCCandidate): KCCandidate {
    return {
      title: item.title,
      situation: item.situation,
      knowhow: item.knowhow,
      precaution: item.precaution,
      tags: item.tags,
      confidence: item.confidence,
      sourceMessageRange: item.source_message_range
        ? {
            start: item.source_message_range.start,
            end: item.source_message_range.end,
          }
        : undefined,
    };
  }

  private async callLlmForDetection(
    chatHistory: string,
  ): Promise<LlmKCCandidate[]> {
    return this.callLlmForDetectionWithContext(chatHistory, '');
  }

  /**
   * Story 2-6: トリガーコンテキスト付きでLLM呼び出し
   */
  private async callLlmForDetectionWithContext(
    chatHistory: string,
    triggerContext: string,
  ): Promise<LlmKCCandidate[]> {
    if (!this.client) {
      return [];
    }

    try {
      const promptText = triggerContext
        ? `${TACIT_KNOWLEDGE_DETECTION_PROMPT}${triggerContext}${chatHistory}`
        : `${TACIT_KNOWLEDGE_DETECTION_PROMPT}${chatHistory}`;

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        config: {
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
      });

      const text = this.extractTextFromResponse(response);
      return this.parseLlmCandidates(text);
    } catch (error) {
      this.logger.error(
        `LLM tacit knowledge detection failed: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private extractTextFromResponse(response: unknown): string {
    if (typeof response !== 'object' || response === null) {
      return '';
    }

    const maybeResponse =
      (response as { response?: unknown }).response ?? response;
    if (
      typeof maybeResponse === 'object' &&
      maybeResponse !== null &&
      typeof (maybeResponse as { text?: unknown }).text === 'function'
    ) {
      return (maybeResponse as { text: () => string }).text().trim();
    }

    const candidates = this.findCandidates(response);
    for (const candidate of candidates) {
      const content = (
        candidate as { content?: { parts?: Array<{ text?: string }> } }
      ).content;
      if (content?.parts) {
        for (const part of content.parts) {
          if (typeof part.text === 'string') {
            return part.text.trim();
          }
        }
      }
    }

    return '';
  }

  private findCandidates(response: unknown): unknown[] {
    if (typeof response !== 'object' || response === null) {
      return [];
    }

    const direct = (response as { candidates?: unknown }).candidates;
    if (Array.isArray(direct)) {
      return direct;
    }

    const nested = (response as { response?: { candidates?: unknown } })
      .response?.candidates;
    if (Array.isArray(nested)) {
      return nested;
    }

    return [];
  }

  private parseLlmCandidates(text: string): LlmKCCandidate[] {
    if (!text?.trim()) {
      return [];
    }

    try {
      const cleaned = text
        .replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1')
        .trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        this.logger.warn('LLM detection response is not an array');
        return [];
      }

      return parsed
        .filter(
          (item): item is LlmKCCandidate =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.title === 'string' &&
            typeof item.situation === 'string' &&
            typeof item.knowhow === 'string' &&
            typeof item.precaution === 'string' &&
            Array.isArray(item.tags) &&
            typeof item.confidence === 'number',
        )
        .map((item) => ({
          title: item.title.trim(),
          situation: item.situation.trim(),
          knowhow: item.knowhow.trim(),
          precaution: item.precaution.trim(),
          tags: item.tags.filter((t): t is string => typeof t === 'string'),
          confidence: Math.max(0, Math.min(1, item.confidence)),
          source_message_range: item.source_message_range,
        }));
    } catch (error) {
      this.logger.warn(
        `Failed to parse LLM detection response: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * embedding生成（text-embedding-004, 768次元）
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.client) {
      return [];
    }

    try {
      const response = await this.client.models.embedContent({
        model: 'text-embedding-004',
        contents: [{ parts: [{ text }] }],
      });

      const embedding = (
        response as { embeddings?: Array<{ values?: number[] }> }
      )?.embeddings?.[0]?.values;
      return embedding ?? [];
    } catch (error) {
      this.logger.error(
        `Embedding generation failed: ${(error as Error).message}`,
      );
      return [];
    }
  }
}

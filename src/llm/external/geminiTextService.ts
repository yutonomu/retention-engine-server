import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

type SummarizeInteractionParams = {
  messageContent: string;
  feedbackContent: string;
  conversationId?: string;
  feedbackId?: string;
  authorName?: string;
};

export type SummaryResult = {
  title: string;
  summary: string;
  keywords: string[];
  category: string;
};

@Injectable()
export class GeminiTextService implements OnModuleInit {
  private readonly logger = new Logger(GeminiTextService.name);

  private client: GoogleGenAI | null = null;

  onModuleInit(): void {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. GeminiTextService is disabled.',
      );
      return;
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async summarizeInteraction(
    params: SummarizeInteractionParams,
  ): Promise<SummaryResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'GeminiTextService is not initialized.',
      );
    }

    this.logger.debug(
      `Summarizing interaction via Gemini: messageLength=${params.messageContent.length}, feedbackLength=${params.feedbackContent.length}`,
    );

    const response = await this.client.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        // JSONのみ返すよう強制
        responseMimeType: 'application/json',
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'あなたは新人教育システムのフィードバックを整理するアシスタントです。',
                '次の「メッセージ」と「フィードバック」を読んで、以下を出力してください。',
                '',
                '1. title: 20文字以内の具体的なタイトル（例：「勤怠システムの使い方」「会議室予約の手順」）',
                '2. summary: 要約（以下の構造で800文字以内）',
                '   - 【質問内容】新人が何を質問したか',
                '   - 【メンターの指導】どのようなフィードバックが与えられたか',
                '   - 【学習ポイント】この会話から学べる重要なポイント',
                '3. keywords: 検索用キーワード5〜10個の配列（日本語）',
                '   - 必ず「フィードバック」「メンター指導」を含める',
                '   - トピックに関連するキーワード（例：「勤怠」「出退勤」「有給」など）',
                '4. category: 以下から最も適切なカテゴリを1つ選択',
                '   - 「業務手順」「社内システム」「コミュニケーション」「業務知識」「その他」',
                '',
                'レスポンスは必ず JSON で以下の形式のみを返してください：',
                '{"title":"...","summary":"...","keywords":["..."],"category":"..."}',
              ].join('\n'),
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              text: `メッセージ（新人からの質問）:\n${params.messageContent}\n\nフィードバック（メンターからの指導）:\n${params.feedbackContent}`,
            },
          ],
        },
      ],
    });

    const text = this.extractText(response);
    const parsed = this.parseSummaryJson(text);
    if (parsed) {
      return parsed;
    }

    if (text?.trim()) {
      this.logger.warn(
        `Gemini summary parse failed. Using raw text as summary. text="${text}"`,
      );
      return this.buildTextFallbackSummary(text);
    }

    const preview = this.safePreview(
      (response as { response?: unknown })?.response ?? response,
    );
    this.logger.warn(
      `Gemini summary parse failed. Falling back to concatenated text. text="${text}" responsePreview=${preview}`,
    );
    return this.buildFallbackSummary(params);
  }

  private buildFallbackSummary(
    params: SummarizeInteractionParams,
  ): SummaryResult {
    return {
      title: 'feedback-summary',
      summary: `【質問内容】\n${params.messageContent}\n\n【メンターの指導】\n${params.feedbackContent}`,
      keywords: ['フィードバック', 'メンター指導', '新人教育'],
      category: 'その他',
    };
  }

  private buildTextFallbackSummary(text: string): SummaryResult {
    const trimmed = text.trim();
    const limited =
      trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed;
    return {
      title: 'feedback-summary',
      summary: limited,
      keywords: ['フィードバック', 'メンター指導', '新人教育'],
      category: 'その他',
    };
  }

  private parseSummaryJson(text: string): SummaryResult | null {
    if (!text?.trim()) {
      return null;
    }
    const candidate = this.extractJsonCandidate(text);
    try {
      const parsed = JSON.parse(candidate) as {
        title?: unknown;
        summary?: unknown;
        keywords?: unknown;
        category?: unknown;
      };
      const title =
        typeof parsed.title === 'string' ? parsed.title.trim() : undefined;
      const summary =
        typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined;
      const keywords = Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((k): k is string => typeof k === 'string')
        : ['フィードバック', 'メンター指導'];
      const category =
        typeof parsed.category === 'string' ? parsed.category.trim() : 'その他';
      if (title && summary) {
        return { title, summary, keywords, category };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse Gemini summary JSON. text="${candidate}" error=${(error as Error).message}`,
      );
    }
    return null;
  }

  private extractJsonCandidate(text: string): string {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1];
    }
    return trimmed;
  }

  private extractText(response: unknown): string {
    if (typeof response !== 'object' || response === null) {
      return '';
    }

    // 1. response.response 구조 (일부 SDK 버전)
    const maybeResponse = (response as { response?: unknown }).response;

    // 2. response.text() 함수가 있는 경우
    const textFn = maybeResponse ?? response;
    if (
      typeof textFn === 'object' &&
      textFn !== null &&
      typeof (textFn as { text?: unknown }).text === 'function'
    ) {
      const text = (textFn as { text: () => string }).text().trim();
      if (text) {
        return text;
      }
    }

    // 3. candidates 배열에서 직접 추출 (response.candidates 또는 response.response.candidates)
    const candidatesRaw = this.findCandidates(response);

    for (const candidate of candidatesRaw) {
      if (
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof (candidate as { content?: unknown }).content !== 'object' ||
        (candidate as { content?: unknown }).content === null
      ) {
        continue;
      }

      const content = candidate as { content?: { parts?: unknown } };
      const maybeParts = content.content?.parts;
      if (!Array.isArray(maybeParts)) {
        continue;
      }

      for (const part of maybeParts) {
        if (
          typeof part === 'object' &&
          part !== null &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          const text = (part as { text: string }).text.trim();
          if (text) {
            return text;
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

    // response.candidates 직접 접근
    const directCandidates = (response as { candidates?: unknown }).candidates;
    if (Array.isArray(directCandidates)) {
      return directCandidates;
    }

    // response.response.candidates 접근
    const nestedResponse = (response as { response?: unknown }).response;
    if (typeof nestedResponse === 'object' && nestedResponse !== null) {
      const nestedCandidates = (nestedResponse as { candidates?: unknown }).candidates;
      if (Array.isArray(nestedCandidates)) {
        return nestedCandidates;
      }
    }

    return [];
  }

  private safePreview(value: unknown): string {
    try {
      const json = JSON.stringify(value);
      return json.length > 2000 ? `${json.slice(0, 2000)}...` : json;
    } catch {
      return '[unserializable response]';
    }
  }
}

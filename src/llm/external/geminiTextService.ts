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
};

export type SummaryResult = {
  title: string;
  summary: string;
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
                '次の「メッセージ」と「フィードバック」を読んで、以下を出力してください。',
                '1. 20文字以内の短いタイトル（要約のラベル）',
                '2. 日本語で簡潔な要約（400文字以内）',
                'レスポンスは必ず JSON で {"title":"...","summary":"..."} の形だけを返してください。余計なテキストは返さないでください。',
              ].join('\n'),
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              text: `メッセージ:\n${params.messageContent}\n\nフィードバック:\n${params.feedbackContent}`,
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
      summary: `メッセージ:\n${params.messageContent}\n\nフィードバック:\n${params.feedbackContent}`,
    };
  }

  private buildTextFallbackSummary(text: string): SummaryResult {
    const trimmed = text.trim();
    const limited =
      trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed;
    return {
      title: 'feedback-summary',
      summary: limited,
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
      };
      const title =
        typeof parsed.title === 'string' ? parsed.title.trim() : undefined;
      const summary =
        typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined;
      if (title && summary) {
        return { title, summary };
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
    const maybeResponse =
      typeof response === 'object' && response !== null
        ? (response as { response?: unknown }).response
        : undefined;

    if (
      typeof maybeResponse === 'object' &&
      maybeResponse !== null &&
      typeof (maybeResponse as { text?: unknown }).text === 'function'
    ) {
      const text = (maybeResponse as { text: () => string }).text().trim();
      if (text) {
        return text;
      }
    }

    const candidatesRaw =
      typeof maybeResponse === 'object' &&
      maybeResponse !== null &&
      Array.isArray((maybeResponse as { candidates?: unknown }).candidates)
        ? (maybeResponse as { candidates: unknown[] }).candidates
        : [];

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

  private safePreview(value: unknown): string {
    try {
      const json = JSON.stringify(value);
      return json.length > 2000 ? `${json.slice(0, 2000)}...` : json;
    } catch {
      return '[unserializable response]';
    }
  }
}

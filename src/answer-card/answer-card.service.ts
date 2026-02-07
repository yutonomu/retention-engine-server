import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  ANSWER_CARD_PORT,
  type AnswerCardPort,
  type ACListQuery,
  type ACListResult,
  type AnswerCardRow,
} from './answer-card.port';
import type {
  GenerateAnswerRequest,
  CreateAnswerCardRequest,
  AnswerCardCandidate,
} from './dto/create-answer-card.dto';
import { UserService } from '../user/user.service';
import { QuestionCardService } from '../question-card/question-card.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { KnowledgeCard } from '../knowledge/knowledge.types';

const ANSWER_KC_SYSTEM_PROMPT = `あなたは新入社員の質問に対して、メンター（先輩社員）の回答をナレッジカード形式に構造化するアシスタントです。

重要: 【質問カードの情報】が提供されている場合は、その質問内容と背景を十分に理解した上で、
メンターの回答を分析してください。

あなたの役割:
1. メンターの回答を分析し、構造化されたナレッジカードを作成する
2. 質問の文脈に沿って、状況・ノウハウ・注意点を整理する
3. 新入社員が理解しやすい言葉遣いにする（専門用語には説明を追加）
4. タグを自動生成する

対話の流れ:
1. まずメンターの回答を分析し、含まれるノウハウや注意点を整理
2. 必要に応じてメンターに確認や補足を求める
3. メンターが承認したら、最終的なナレッジカードを生成

最終回答の生成時は、以下のJSON形式で出力してください:
\`\`\`json
{
  "ready": true,
  "knowledgeCard": {
    "title": "ナレッジカードのタイトル（簡潔に）",
    "situation": "どのような状況で必要になるノウハウか（質問の背景を踏まえて記述）",
    "knowhow": "具体的なノウハウ・知見（手順や方法を分かりやすく記述）",
    "precaution": "注意点・気をつけるべきこと",
    "importance": "なぜ重要か（任意）",
    "example": "具体例（任意）",
    "tags": ["タグ1", "タグ2"],
    "confidence": 0.85
  }
}
\`\`\`

まだ対話中の場合は通常のテキストで返答してください（JSONは不要）。`;

interface GenerateStreamEvent {
  type: 'chunk' | 'answer' | 'done' | 'error';
  data: string;
}

@Injectable()
export class AnswerCardService implements OnModuleInit {
  private readonly logger = new Logger(AnswerCardService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(ANSWER_CARD_PORT)
    private readonly acPort: AnswerCardPort,
    private readonly userService: UserService,
    private readonly questionCardService: QuestionCardService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  onModuleInit(): void {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. AnswerCard AI generation is disabled.',
      );
      return;
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * AI対話による回答作成（ストリーミング）
   */
  async *generateStream(
    dto: GenerateAnswerRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<GenerateStreamEvent> {
    if (!this.client) {
      yield {
        type: 'error',
        data: 'AI機能が利用できません（APIキー未設定）',
      };
      return;
    }

    try {
      let questionContext = '';
      if (dto.questionCardId) {
        try {
          const qc = await this.questionCardService.getQuestionCard(dto.questionCardId);
          questionContext = `\n\n【質問カードの情報】\nタイトル: ${qc.title}\n質問内容: ${qc.question_body}${qc.background ? `\n背景・状況: ${qc.background}` : ''}`;
        } catch {
          this.logger.warn(`Question card ${dto.questionCardId} not found, proceeding without context`);
        }
      }

      const contents = [
        {
          role: 'user' as const,
          parts: [
            {
              text: `${ANSWER_KC_SYSTEM_PROMPT}${questionContext}\n\n【メンターの回答】\n${dto.mentorInput}`,
            },
          ],
        },
        ...dto.chatHistory.map((msg) => ({
          role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          parts: [{ text: msg.content }],
        })),
      ];

      const response = await this.client.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents,
      });

      let fullText = '';

      for await (const chunk of response) {
        if (signal?.aborted) break;
        const text =
          chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) {
          fullText += text;
          yield { type: 'chunk', data: text };
        }
      }

      // レスポンス全体からJSON部分を抽出してKC候補を検出
      const answer = this.extractKCFromText(fullText);
      if (answer) {
        yield { type: 'answer', data: JSON.stringify(answer) };
      }

      yield { type: 'done', data: '' };
    } catch (error) {
      this.logger.error(
        `Answer card generation failed: ${(error as Error).message}`,
      );
      yield {
        type: 'error',
        data: '回答カードの生成中にエラーが発生しました。',
      };
    }
  }

  /**
   * AI応答（非ストリーミング）
   */
  async generateResponse(
    dto: GenerateAnswerRequest,
  ): Promise<{ message: string; answer: AnswerCardCandidate | null }> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI機能が利用できません（APIキー未設定）',
      );
    }

    let questionContext = '';
    if (dto.questionCardId) {
      try {
        const qc = await this.questionCardService.getQuestionCard(dto.questionCardId);
        questionContext = `\n\n【質問カードの情報】\nタイトル: ${qc.title}\n質問内容: ${qc.question_body}${qc.background ? `\n背景・状況: ${qc.background}` : ''}`;
      } catch {
        this.logger.warn(`Question card ${dto.questionCardId} not found, proceeding without context`);
      }
    }

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: `${ANSWER_KC_SYSTEM_PROMPT}${questionContext}\n\n【メンターの回答】\n${dto.mentorInput}`,
          },
        ],
      },
      ...dto.chatHistory.map((msg) => ({
        role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: msg.content }],
      })),
    ];

    const response = await this.client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
    });

    const text = this.extractTextFromResponse(response);
    const answer = this.extractKCFromText(text);

    return {
      message: answer ? '' : text,
      answer,
    };
  }

  /**
   * 回答をKnowledgeCardとして保存（KnowledgeServiceに委譲）
   */
  async saveAsKnowledgeCard(
    dto: CreateAnswerCardRequest,
    userId: string,
  ): Promise<KnowledgeCard> {
    const kc = await this.knowledgeService.saveKnowledgeCard(
      {
        questionCardId: dto.questionCardId,
        candidate: {
          title: dto.candidate.title,
          situation: dto.candidate.situation,
          knowhow: dto.candidate.knowhow,
          precaution: dto.candidate.precaution,
          tags: dto.candidate.tags,
          confidence: dto.candidate.confidence,
          importance: dto.candidate.importance,
          example: dto.candidate.example,
        },
      },
      userId,
    );

    this.logger.log(
      `Saved answer as knowledge card ${kc.id} for question ${dto.questionCardId} by user ${userId}`,
    );

    return kc;
  }

  /**
   * 回答カード一覧取得（旧データ閲覧用）
   */
  async listAnswerCards(query: ACListQuery): Promise<ACListResult> {
    return this.acPort.findAll(query);
  }

  /**
   * 質問カードに対する回答カード一覧取得（旧データ閲覧用）
   */
  async getAnswersByQuestionCard(questionCardId: string): Promise<AnswerCardRow[]> {
    return this.acPort.findByQuestionCardId(questionCardId);
  }

  /**
   * 回答カード詳細取得 + viewCount増加
   */
  async getAnswerCard(id: string): Promise<AnswerCardRow> {
    const ac = await this.acPort.findById(id);
    if (!ac) {
      throw new NotFoundException(`Answer card ${id} not found`);
    }

    this.acPort.incrementViewCount(id).catch((err) => {
      this.logger.warn(`Failed to increment view count: ${(err as Error).message}`);
    });

    return ac;
  }

  /**
   * 回答カード更新
   */
  async updateAnswerCard(
    id: string,
    data: Partial<Pick<AnswerCardRow, 'content' | 'original_content'>>,
  ): Promise<AnswerCardRow> {
    const existing = await this.acPort.findById(id);
    if (!existing) {
      throw new NotFoundException(`Answer card ${id} not found`);
    }
    return this.acPort.update(id, data);
  }

  /**
   * 回答カード削除
   */
  async deleteAnswerCard(id: string): Promise<void> {
    const existing = await this.acPort.findById(id);
    if (!existing) {
      throw new NotFoundException(`Answer card ${id} not found`);
    }
    await this.acPort.delete(id);
    this.logger.log(`Deleted answer card ${id}`);
  }

  /**
   * creator_id の配列から { [id]: displayName } マップを返す
   */
  async resolveCreatorNames(
    creatorIds: string[],
  ): Promise<Record<string, string>> {
    const unique = [...new Set(creatorIds)];
    const names: Record<string, string> = {};
    await Promise.all(
      unique.map(async (id) => {
        const name = await this.userService.findUserNameById(id);
        names[id] = name ?? id;
      }),
    );
    return names;
  }

  // --- Private helpers ---

  /**
   * AIレスポンスからKC候補（ナレッジカード形式）を抽出
   */
  private extractKCFromText(text: string): AnswerCardCandidate | null {
    if (!text?.trim()) return null;

    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;

      const cleaned = jsonStr.trim();
      if (!cleaned.includes('"ready"')) return null;

      const parsed = JSON.parse(cleaned);
      if (!parsed.ready || !parsed.knowledgeCard) return null;

      const kc = parsed.knowledgeCard;
      if (
        typeof kc.title !== 'string' ||
        typeof kc.situation !== 'string' ||
        typeof kc.knowhow !== 'string' ||
        typeof kc.precaution !== 'string'
      ) {
        return null;
      }

      return {
        title: kc.title.trim(),
        situation: kc.situation.trim(),
        knowhow: kc.knowhow.trim(),
        precaution: kc.precaution.trim(),
        tags: Array.isArray(kc.tags)
          ? kc.tags.filter((t: unknown): t is string => typeof t === 'string')
          : [],
        confidence: typeof kc.confidence === 'number' ? kc.confidence : 0.8,
        importance: typeof kc.importance === 'string' ? kc.importance.trim() : undefined,
        example: typeof kc.example === 'string' ? kc.example.trim() : undefined,
      };
    } catch {
      return null;
    }
  }

  private extractTextFromResponse(response: unknown): string {
    if (typeof response !== 'object' || response === null) return '';

    const maybeResponse =
      (response as { response?: unknown }).response ?? response;
    if (
      typeof maybeResponse === 'object' &&
      maybeResponse !== null &&
      typeof (maybeResponse as { text?: unknown }).text === 'function'
    ) {
      return (maybeResponse as { text: () => string }).text().trim();
    }

    const candidates = (
      response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    ).candidates;
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (typeof part.text === 'string') {
              return part.text.trim();
            }
          }
        }
      }
    }

    return '';
  }
}

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
  QUESTION_CARD_PORT,
  type QuestionCardPort,
  type QCListQuery,
  type QCListResult,
  type QuestionCardRow,
} from './question-card.port';
import type {
  CreateQuestionCardsRequest,
  GenerateQuestionCardsRequest,
  QuestionCardCandidate,
} from './dto/create-question-card.dto';
import { UserService } from '../user/user.service';

const QUESTION_CREATION_SYSTEM_PROMPT = `あなたは新入社員が先輩社員に質問するのを手助けするアシスタントです。

新入社員はAIの回答を読んだ後、先輩社員に直接聞きたいことがあります。
しかし、何をどう聞けばよいか整理できていないことが多いです。

あなたの役割:
1. まず新入社員に「何について先輩に聞きたいか」を聞き出す
2. 「現在どう理解しているか」を確認する
3. 「具体的に何がわからないか」を明確にする
4. 十分な情報が集まったら、質問カードを生成する

ヒアリングは2〜3ターンで行い、簡潔に質問してください。
新入社員が十分に説明できたと判断したら、質問カードを生成してください。

質問カードの生成時は、以下のJSON形式で出力してください:
\`\`\`json
{
  "ready": true,
  "cards": [
    {
      "title": "質問のタイトル（簡潔に）",
      "background": "なぜこの質問をしたいのか、背景や状況",
      "questionBody": "具体的に聞きたいこと",
      "tags": ["タグ1", "タグ2"]
    }
  ]
}
\`\`\`

まだヒアリング中の場合は通常のテキストで返答してください（JSONは不要）。
1つのテーマから複数の質問カードが作成される場合もあります。`;

interface GenerateStreamEvent {
  type: 'chunk' | 'cards' | 'done' | 'error';
  data: string;
}

@Injectable()
export class QuestionCardService implements OnModuleInit {
  private readonly logger = new Logger(QuestionCardService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(QUESTION_CARD_PORT)
    private readonly qcPort: QuestionCardPort,
    private readonly userService: UserService,
  ) {}

  onModuleInit(): void {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY is not set. QuestionCard AI generation is disabled.',
      );
      return;
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * AI対話による質問カード生成（ストリーミング）
   */
  async *generateStream(
    dto: GenerateQuestionCardsRequest,
  ): AsyncGenerator<GenerateStreamEvent> {
    if (!this.client) {
      yield {
        type: 'error',
        data: 'AI機能が利用できません（APIキー未設定）',
      };
      return;
    }

    try {
      // 会話履歴を構築
      const contents = [
        {
          role: 'user' as const,
          parts: [
            {
              text: `${QUESTION_CREATION_SYSTEM_PROMPT}\n\n【元のAI回答】\n${dto.originalAiMessage}`,
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
        const text =
          chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) {
          fullText += text;
          yield { type: 'chunk', data: text };
        }
      }

      // レスポンス全体からJSON部分を抽出してカード候補を検出
      const cards = this.extractCardsFromText(fullText);
      if (cards.length > 0) {
        yield { type: 'cards', data: JSON.stringify(cards) };
      }

      yield { type: 'done', data: '' };
    } catch (error) {
      this.logger.error(
        `Question card generation failed: ${(error as Error).message}`,
      );
      yield {
        type: 'error',
        data: '質問カードの生成中にエラーが発生しました。',
      };
    }
  }

  /**
   * AI応答（非ストリーミング）— ヒアリング中の単発応答
   */
  async generateResponse(
    dto: GenerateQuestionCardsRequest,
  ): Promise<{ message: string; cards: QuestionCardCandidate[] }> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI機能が利用できません（APIキー未設定）',
      );
    }

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: `${QUESTION_CREATION_SYSTEM_PROMPT}\n\n【元のAI回答】\n${dto.originalAiMessage}`,
          },
        ],
      },
      ...dto.chatHistory.map((msg) => ({
        role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        contents: [{ text: msg.content }],
      })),
    ];

    const response = await this.client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents.map((c) => ({
        role: c.role,
        parts: 'parts' in c ? c.parts : (c as { contents: Array<{ text: string }> }).contents.map((t) => ({ text: t.text })),
      })),
    });

    const text = this.extractTextFromResponse(response);
    const cards = this.extractCardsFromText(text);

    return {
      message: cards.length > 0 ? '' : text,
      cards,
    };
  }

  /**
   * 質問カードを保存（複数一括）
   */
  async saveQuestionCards(
    dto: CreateQuestionCardsRequest,
    userId: string,
  ): Promise<QuestionCardRow[]> {
    const results: QuestionCardRow[] = [];

    for (const card of dto.cards) {
      const created = await this.qcPort.create({
        title: card.title,
        background: card.background,
        question_body: card.questionBody,
        status: 'open',
        creator_id: userId,
        is_anonymous: card.isAnonymous,
        tags: card.tags,
        source_conv_id: dto.sourceConvId ?? null,
        source_msg_id: dto.sourceMsgId ?? null,
      });
      results.push(created);
    }

    this.logger.log(
      `Saved ${results.length} question cards for user ${userId}`,
    );

    return results;
  }

  /**
   * 質問カード一覧取得
   */
  async listQuestionCards(query: QCListQuery): Promise<QCListResult> {
    return this.qcPort.findAll(query);
  }

  /**
   * 質問カード詳細取得 + viewCount増加
   */
  async getQuestionCard(id: string): Promise<QuestionCardRow> {
    const qc = await this.qcPort.findById(id);
    if (!qc) {
      throw new NotFoundException(`Question card ${id} not found`);
    }

    this.qcPort.incrementViewCount(id).catch((err) => {
      this.logger.warn(`Failed to increment view count: ${(err as Error).message}`);
    });

    return qc;
  }

  /**
   * 質問カード更新
   */
  async updateQuestionCard(
    id: string,
    data: Partial<Pick<QuestionCardRow, 'title' | 'background' | 'question_body' | 'status' | 'tags'>>,
  ): Promise<QuestionCardRow> {
    const existing = await this.qcPort.findById(id);
    if (!existing) {
      throw new NotFoundException(`Question card ${id} not found`);
    }
    return this.qcPort.update(id, data);
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

  private extractCardsFromText(text: string): QuestionCardCandidate[] {
    if (!text?.trim()) return [];

    try {
      // JSON部分を抽出
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;

      // "ready": true を含むJSONを探す
      const cleaned = jsonStr.trim();
      if (!cleaned.includes('"ready"')) return [];

      const parsed = JSON.parse(cleaned);
      if (!parsed.ready || !Array.isArray(parsed.cards)) return [];

      return parsed.cards
        .filter(
          (c: unknown): c is QuestionCardCandidate =>
            typeof c === 'object' &&
            c !== null &&
            typeof (c as QuestionCardCandidate).title === 'string' &&
            typeof (c as QuestionCardCandidate).background === 'string' &&
            typeof (c as QuestionCardCandidate).questionBody === 'string',
        )
        .map((c: QuestionCardCandidate) => ({
          title: c.title.trim(),
          background: c.background.trim(),
          questionBody: c.questionBody.trim(),
          tags: Array.isArray(c.tags)
            ? c.tags.filter((t): t is string => typeof t === 'string')
            : [],
          isAnonymous: false,
        }));
    } catch {
      return [];
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

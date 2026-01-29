import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { KNOWLEDGE_PORT, type KnowledgePort, type KnowledgeListQuery, type KnowledgeListResult } from './knowledge.port';
import { MESSAGE_PORT, type MessagePort } from '../message/message.port';
import type { ExtractKnowledgeRequest } from './dto/extractKnowledge.dto';
import type { SaveKnowledgeRequest } from './dto/saveKnowledge.dto';
import type {
  ExtractKnowledgeResponse,
  ExtractedKnowledgeItem,
  DuplicateKnowledgeItem,
  ExtractKnowledgePreviewResponse,
  KnowledgeCandidate,
  SaveKnowledgeResponse,
} from './dto/knowledgeResponse.dto';
import type { LlmExtractedItem } from './knowledge.types';

const EXTRACTION_PROMPT = `以下のチャット履歴から、チームメンバーに共有すると役立つ「ナレッジ」を抽出してください。
この会話はベテラン社員がAIアシスタントと業務について相談した内容です。

【重要】ナレッジの主なソースは[社員]の発言です。
ベテラン社員はAIへの質問や相談の中で、自身の経験・知識を前提として語ります。
例：「〜だと思いますが」「うちでは〜している」「普段は〜で対応している」「〜のルールがあって」
→ これらの前提部分こそが、チームに共有すべき暗黙知です。
AIの回答も補足情報として抽出対象に含めますが、社員の発言を優先してください。

【ナレッジのカテゴリ】
- 対応方法: 特定の状況での対処法、トラブルシューティング、効率化のコツ、実践的なTips（例：「〇〇が起きたらまず△△を確認する」「XXする時はYYも一緒にやると効率的」）
- 業界用語: 業界・社内特有の専門用語、略語、概念の解説（例：「RTEとは〇〇のこと」「この業界ではXXをYYと呼ぶ」）
- 業務知識: 業務のルール・判断基準・プロセス・ツールの使い方・環境設定・注意点（例：「経費申請は月末締め」「XXツールではYY設定をONにする」）

【出力形式】JSON配列のみを返してください
[
  {
    "content": "抽出された知識（完結した文章で、新人が読んでもわかるように具体的に記述）",
    "category": "対応方法" | "業界用語" | "業務知識",
    "tags": ["関連キーワード1", "関連キーワード2"]
  }
]

【抽出の方針】
- 積極的に抽出する（ユーザーがプレビューで取捨選択できるため、多めに抽出してOK）
- 「新人がこれを読んだら助かるか？」を基準に判断する
- [社員]の発言に含まれる経験・判断・ルール・コツは最優先で抽出する
- 1トピック = 1エントリ（関連する複数のやり取りは1つにまとめる）
- 一般的な技術知識でも、実務で役立つ内容であれば抽出する
- 迷ったら抽出する（抽出しすぎて困ることはない）

【除外するもの】
- 挨拶・雑談・感謝のみの発言
- 会話の進行に関するやり取り（「もう少し詳しく教えて」「了解です」など）

【抽出対象がない場合】空配列 [] を返す（挨拶・雑談のみの会話の場合）

---
チャット履歴:
`;

const SIMILARITY_THRESHOLD = 0.85;
const RECENT_MESSAGE_COUNT = 20; // 「直近」の定義

@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(KNOWLEDGE_PORT)
    private readonly knowledgePort: KnowledgePort,
    @Inject(MESSAGE_PORT)
    private readonly messagePort: MessagePort,
  ) {}

  onModuleInit(): void {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn('GOOGLE_API_KEY is not set. KnowledgeService LLM features are disabled.');
      return;
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async extractKnowledge(request: ExtractKnowledgeRequest): Promise<ExtractKnowledgeResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('KnowledgeService is not initialized (missing API key).');
    }

    // 1. メッセージ履歴を取得
    const allMessages = await this.messagePort.findAllByConversation(request.conversationId);

    if (allMessages.length === 0) {
      return { extracted: [], duplicates: [], totalProcessed: 0 };
    }

    // 2. 範囲に応じてメッセージをフィルタ
    const messages = this.filterMessagesByRange(allMessages, request.range);

    if (messages.length === 0) {
      return { extracted: [], duplicates: [], totalProcessed: 0 };
    }

    // 3. チャット履歴を文字列に変換
    const chatHistory = messages
      .map((m) => `[${m.role === 'ASSISTANT' ? 'AI' : '社員'}]: ${m.content}`)
      .join('\n\n');

    // 4. LLM で抽出
    const extractedItems = await this.callLlmForExtraction(chatHistory);

    if (extractedItems.length === 0) {
      return { extracted: [], duplicates: [], totalProcessed: 0 };
    }

    // 5. 各アイテムを処理（embedding生成 → 重複チェック → 保存）
    const extracted: ExtractedKnowledgeItem[] = [];
    const duplicates: DuplicateKnowledgeItem[] = [];

    for (const item of extractedItems) {
      // embedding 生成
      const embedding = await this.generateEmbedding(item.content);

      // 重複チェック
      const similar = await this.knowledgePort.findSimilar(embedding, SIMILARITY_THRESHOLD, 1);

      if (similar.length > 0) {
        // 重複あり
        duplicates.push({
          content: item.content,
          category: item.category,
          existingId: similar[0].id,
          similarity: similar[0].similarity,
        });
      } else {
        // 重複なし → 保存
        const saved = await this.knowledgePort.save({
          content: item.content,
          category: item.category,
          tags: item.tags,
          source_conversation_id: request.conversationId,
          source_message_range: this.getMessageRange(request.range, allMessages.length),
          extracted_by: request.userId,
          embedding,
        });

        extracted.push({
          id: saved.id,
          content: saved.content,
          category: saved.category,
          tags: saved.tags,
        });
      }
    }

    return {
      extracted,
      duplicates,
      totalProcessed: extractedItems.length,
    };
  }

  async listKnowledge(query: KnowledgeListQuery): Promise<KnowledgeListResult> {
    const result = await this.knowledgePort.findAll(query);
    // 旧データのカテゴリを正規化（「ルール」「判断基準」→「業務知識」など）
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        category: this.normalizeCategory(item.category),
      })),
    };
  }

  async updateKnowledge(id: string, data: { category: string }): Promise<{ id: string; category: string }> {
    const normalizedCategory = this.normalizeCategory(data.category);
    const updated = await this.knowledgePort.update(id, { category: normalizedCategory });
    return { id: updated.id, category: updated.category };
  }

  /**
   * 抽出プレビュー: LLMで候補を抽出するが保存しない
   */
  async extractKnowledgePreview(request: ExtractKnowledgeRequest): Promise<ExtractKnowledgePreviewResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('KnowledgeService is not initialized (missing API key).');
    }

    const allMessages = await this.messagePort.findAllByConversation(request.conversationId);
    if (allMessages.length === 0) {
      return { candidates: [], totalProcessed: 0 };
    }

    const messages = this.filterMessagesByRange(allMessages, request.range);
    if (messages.length === 0) {
      return { candidates: [], totalProcessed: 0 };
    }

    const chatHistory = messages
      .map((m) => `[${m.role === 'ASSISTANT' ? 'AI' : '社員'}]: ${m.content}`)
      .join('\n\n');

    const extractedItems = await this.callLlmForExtraction(chatHistory);

    const candidates: KnowledgeCandidate[] = extractedItems.map((item) => ({
      content: item.content,
      category: item.category,
      tags: item.tags,
    }));

    return { candidates, totalProcessed: extractedItems.length };
  }

  /**
   * 選択された候補を保存: embedding生成 → 重複チェック → 保存
   */
  async saveKnowledgeItems(request: SaveKnowledgeRequest): Promise<SaveKnowledgeResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('KnowledgeService is not initialized (missing API key).');
    }

    const saved: ExtractedKnowledgeItem[] = [];
    const duplicates: DuplicateKnowledgeItem[] = [];

    for (const item of request.items) {
      const normalizedCategory = this.normalizeCategory(item.category);
      const embedding = await this.generateEmbedding(item.content);

      const similar = await this.knowledgePort.findSimilar(embedding, SIMILARITY_THRESHOLD, 1);

      if (similar.length > 0) {
        duplicates.push({
          content: item.content,
          category: normalizedCategory,
          existingId: similar[0].id,
          similarity: similar[0].similarity,
        });
      } else {
        const savedItem = await this.knowledgePort.save({
          content: item.content,
          category: normalizedCategory,
          tags: item.tags,
          source_conversation_id: request.conversationId,
          source_message_range: null,
          extracted_by: request.userId,
          embedding,
        });

        saved.push({
          id: savedItem.id,
          content: savedItem.content,
          category: savedItem.category,
          tags: savedItem.tags,
        });
      }
    }

    return { saved, duplicates };
  }

  private filterMessagesByRange(
    messages: Array<{ role: string; content: string }>,
    range: ExtractKnowledgeRequest['range'],
  ): Array<{ role: string; content: string }> {
    if (range === 'all' || !range) {
      return messages;
    }

    if (range === 'recent') {
      return messages.slice(-RECENT_MESSAGE_COUNT);
    }

    if (typeof range === 'object' && 'startIndex' in range) {
      return messages.slice(range.startIndex, range.endIndex + 1);
    }

    return messages;
  }

  private getMessageRange(
    range: ExtractKnowledgeRequest['range'],
    totalMessages: number,
  ): { startIndex: number; endIndex: number } | null {
    if (range === 'all' || !range) {
      return null;
    }

    if (range === 'recent') {
      const start = Math.max(0, totalMessages - RECENT_MESSAGE_COUNT);
      return { startIndex: start, endIndex: totalMessages - 1 };
    }

    if (typeof range === 'object' && 'startIndex' in range) {
      return range;
    }

    return null;
  }

  private async callLlmForExtraction(chatHistory: string): Promise<LlmExtractedItem[]> {
    if (!this.client) {
      return [];
    }

    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        config: {
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: EXTRACTION_PROMPT + chatHistory }],
          },
        ],
      });

      const text = this.extractTextFromResponse(response);
      return this.parseExtractedItems(text);
    } catch (error) {
      this.logger.error(`LLM extraction failed: ${(error as Error).message}`);
      return [];
    }
  }

  private extractTextFromResponse(response: unknown): string {
    if (typeof response !== 'object' || response === null) {
      return '';
    }

    // response.text() がある場合
    const maybeResponse = (response as { response?: unknown }).response ?? response;
    if (
      typeof maybeResponse === 'object' &&
      maybeResponse !== null &&
      typeof (maybeResponse as { text?: unknown }).text === 'function'
    ) {
      return (maybeResponse as { text: () => string }).text().trim();
    }

    // candidates から抽出
    const candidates = this.findCandidates(response);
    for (const candidate of candidates) {
      const content = (candidate as { content?: { parts?: Array<{ text?: string }> } }).content;
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

    const nested = (response as { response?: { candidates?: unknown } }).response?.candidates;
    if (Array.isArray(nested)) {
      return nested;
    }

    return [];
  }

  private parseExtractedItems(text: string): LlmExtractedItem[] {
    if (!text?.trim()) {
      return [];
    }

    try {
      // コードブロックを除去
      const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        this.logger.warn('LLM response is not an array');
        return [];
      }

      return parsed
        .filter(
          (item): item is LlmExtractedItem =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.content === 'string' &&
            typeof item.category === 'string' &&
            Array.isArray(item.tags),
        )
        .map((item) => ({
          content: item.content.trim(),
          category: this.normalizeCategory(item.category),
          tags: item.tags.filter((t): t is string => typeof t === 'string'),
        }));
    } catch (error) {
      this.logger.warn(`Failed to parse LLM response: ${(error as Error).message}`);
      return [];
    }
  }

  private normalizeCategory(category: string): string {
    const validCategories = ['対応方法', '業界用語', '業務知識'];
    const trimmed = category.trim();

    if (validCategories.includes(trimmed)) {
      return trimmed;
    }

    // 旧カテゴリ・類似カテゴリのマッピング
    const mapping: Record<string, string> = {
      'トラブル対応': '対応方法',
      'トラブルシューティング': '対応方法',
      '問題解決': '対応方法',
      '対処法': '対応方法',
      '用語': '業界用語',
      '専門用語': '業界用語',
      '略語': '業界用語',
      '判断基準': '業務知識',
      '業務判断基準': '業務知識',
      '判断': '業務知識',
      'ルール': '業務知識',
      '社内ルール': '業務知識',
      '慣習': '業務知識',
      // LLMがプロンプト外のカテゴリ名を返した場合の吸収
      'ノウハウ': '対応方法',
      'Tips': '対応方法',
      'コツ': '対応方法',
      'ベストプラクティス': '対応方法',
      'ツール': '業務知識',
      '環境': '業務知識',
      '設定': '業務知識',
      'ワークフロー': '業務知識',
    };

    return mapping[trimmed] ?? '業務知識';
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.client) {
      return [];
    }

    try {
      const response = await this.client.models.embedContent({
        model: 'text-embedding-004',
        contents: [{ parts: [{ text }] }],
      });

      const embedding = (response as { embeddings?: Array<{ values?: number[] }> })?.embeddings?.[0]?.values;
      return embedding ?? [];
    } catch (error) {
      this.logger.error(`Embedding generation failed: ${(error as Error).message}`);
      return [];
    }
  }
}

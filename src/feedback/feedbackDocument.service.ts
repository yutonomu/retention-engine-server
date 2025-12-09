import { Inject, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  GeminiTextService,
  type SummaryResult,
} from '../llm/external/geminiTextService';
import { MESSAGE_PORT, type MessagePort } from '../message/message.port';
import type { Feedback } from './feedback.types';

export interface SummaryDocument {
  filePath: string;
  displayName: string;
  summary: string;
}

@Injectable()
export class FeedbackDocumentService {
  private readonly logger = new Logger(FeedbackDocumentService.name);

  constructor(
    @Inject(MESSAGE_PORT)
    private readonly messageRepository: MessagePort,
    private readonly geminiTextService: GeminiTextService,
  ) {}

  async createSummaryDocument(feedback: Feedback): Promise<SummaryDocument> {
    const message = await this.messageRepository.findById(
      feedback.target_msg_id,
    );
    const summaryResult = await this.geminiTextService.summarizeInteraction({
      messageContent: message.content,
      feedbackContent: feedback.content,
    });

    // 検索しやすい構造化文書を生成
    // created_at는 Supabase에서 이미 ISO 문자열로 반환되므로 직접 사용
    const createdAtStr =
      feedback.created_at instanceof Date
        ? feedback.created_at.toISOString()
        : String(feedback.created_at);
    const documentContent = this.buildSearchableDocument(
      summaryResult,
      message.content,
      feedback.content,
      createdAtStr,
    );

    // Geminiが生成したタイトルをファイル名に使用（検索しやすくするため）
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortId = feedback.fb_id.slice(0, 8);
    const sanitizedTitle = this.sanitizeFileName(summaryResult.title) || 'mentor-feedback';
    const displayName = `${sanitizedTitle}_${timestamp}_${shortId}.txt`;
    const filePath = path.resolve(process.cwd(), 'resources', displayName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, documentContent, 'utf8');

    this.logger.log(
      `Created searchable feedback document: ${displayName} (category: ${summaryResult.category}, keywords: ${summaryResult.keywords.length})`,
    );

    return { filePath, displayName, summary: summaryResult.summary };
  }

  /**
   * 検索効率を最大化する構造化文書を生成
   * - メタデータヘッダー（キーワード、カテゴリ）
   * - 構造化された要約
   * - 原文も含めて全文検索対応
   */
  private buildSearchableDocument(
    summaryResult: SummaryResult,
    originalMessage: string,
    originalFeedback: string,
    createdAt: string,
  ): string {
    const sections = [
      '=== メンターフィードバック記録 ===',
      '',
      `タイトル: ${summaryResult.title}`,
      `カテゴリ: ${summaryResult.category}`,
      `キーワード: ${summaryResult.keywords.join(', ')}`,
      `作成日: ${createdAt}`,
      '',
      '--- 要約 ---',
      summaryResult.summary,
      '',
      '--- 原文：新人からの質問 ---',
      originalMessage,
      '',
      '--- 原文：メンターからのフィードバック ---',
      originalFeedback,
      '',
      '=== 文書終了 ===',
    ];

    return sections.join('\n');
  }

  /**
   * ファイル名に使用できない文字を除去・置換
   */
  private sanitizeFileName(title: string): string {
    return title
      .replace(/[\\/:*?"<>|]/g, '') // Windows/Unix で使えない文字を除去
      .replace(/\s+/g, '-')         // スペースをハイフンに
      .slice(0, 50)                  // 長すぎる場合は切り詰め
      .replace(/-+$/, '');           // 末尾のハイフンを除去
  }
}

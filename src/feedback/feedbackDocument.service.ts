import { Inject, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GeminiTextService } from '../llm/external/geminiTextService';
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

    const displayName = this.createSafeFileName(`${summaryResult.title}.txt`);
    const filePath = path.resolve(process.cwd(), 'resources', displayName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, summaryResult.summary, 'utf8');

    return { filePath, displayName, summary: summaryResult.summary };
  }

  private createSafeFileName(name: string): string {
    const basename = path.basename(name, path.extname(name)) || 'feedback';
    const ext = path.extname(name) || '.txt';
    const ascii = basename.normalize('NFKD').replace(/[^\x20-\x7E]+/g, '_');
    const sanitized = ascii.replace(/[\\/:*?"<>|]+/g, '_').trim();
    const safe =
      sanitized && /[A-Za-z0-9_-]/.test(sanitized)
        ? sanitized
        : 'feedback-summary';
    return `${safe}${ext}`;
  }
}

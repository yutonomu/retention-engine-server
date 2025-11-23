import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import type { Feedback } from './feedback.types';
import { FeedbackDocumentService } from './feedbackDocument.service';
import { LlmService } from '../llm/llm.service';

interface CreateFeedbackRequestBody {
  messageId: string;
  authorId: string;
  content: string;
}

interface FeedbackListResponse {
  data: Feedback[];
}

interface CreateFeedbackResponse {
  data: Feedback;
}

@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly feedbackDocumentService: FeedbackDocumentService,
    private readonly llmService: LlmService,
  ) {}

  private readonly logger = new Logger(FeedbackController.name);

  @Get()
  async getFeedbackByMessage(
    @Query('messageId') messageId: string,
  ): Promise<FeedbackListResponse> {
    const result = await this.feedbackService.getFeedbackByMessage(messageId);
    return { data: result.items };
  }

  @Post()
  async createFeedback(
    @Body() dto: CreateFeedbackRequestBody,
  ): Promise<CreateFeedbackResponse> {
    const feedback = await this.feedbackService.createFeedback({
      messageId: dto.messageId,
      authorId: dto.authorId,
      content: dto.content,
    });
    try {
      const summaryDoc =
        await this.feedbackDocumentService.createSummaryDocument(feedback);
      await this.llmService.uploadDocument({
        filePath: summaryDoc.filePath,
        displayName: summaryDoc.displayName,
        mimeType: 'text/plain',
      });
    } catch (error) {
      // 要約やアップロード失敗時もレスポンスは成功させる
      const message =
        (error as Error)?.message ?? 'Failed to process feedback document.';
      this.logger.warn(
        `Feedback document processing skipped for feedbackId="${feedback.fb_id}": ${message}`,
      );
    }
    return { data: feedback };
  }
}
